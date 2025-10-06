from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from web3 import Web3
from eth_account.messages import encode_defunct
from websockets.exceptions import ConnectionClosedError
import json
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

# Configuration
GANACHE_URL = os.getenv("GANACHE_URL", "")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")
CONTRACT_ABI = []


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, bool] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        if websocket in self.active_connections and self.active_connections[websocket]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"Error sending message: {e}")
                self.disconnect(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for websocket in self.active_connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"Error broadcasting: {e}")
                disconnected.append(websocket)

        # Remove disconnected websockets
        for ws in disconnected:
            self.disconnect(ws)


manager = ConnectionManager()


# Lifespan context manager for background tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    task = asyncio.create_task(broadcast_results())
    yield
    # Shutdown
    task.cancel()


app = FastAPI(title="Blockchain Voting System API", version="1.0.0", lifespan=lifespan)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Web3 connection
w3 = Web3(Web3.HTTPProvider(GANACHE_URL))


# Load contract
def load_contract():
    try:
        with open('./Smart-Contracts/build/contracts/VotingSystem.json', 'r') as file:
            contract_json = json.load(file)
            global CONTRACT_ABI, CONTRACT_ADDRESS
            CONTRACT_ABI = contract_json['abi']
            # Get deployed address from networks
            if contract_json.get('networks'):
                network_id = list(contract_json['networks'].keys())[0]
                CONTRACT_ADDRESS = contract_json['networks'][network_id]['address']

        return w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
    except Exception as e:
        print(f"Error loading contract: {e}")
        return None


contract = load_contract()


# Pydantic models
class LoginRequest(BaseModel):
    address: str
    signature: str
    message: str


class LoginResponse(BaseModel):
    address: str
    isAdmin: bool
    authenticated: bool


class ElectionCreate(BaseModel):
    name: str
    description: str
    startTime: int
    endTime: int
    senderAddress: str


class CandidateCreate(BaseModel):
    electionId: int
    name: str
    party: str
    imageUrl: Optional[str] = ""
    senderAddress: str


class VoterRegister(BaseModel):
    electionId: int
    voterAddresses: List[str]
    senderAddress: str


class VoteRequest(BaseModel):
    electionId: int
    candidateId: int
    senderAddress: str


class Election(BaseModel):
    id: int
    name: str
    description: str
    startTime: int
    endTime: int
    isActive: bool
    creator: str
    totalVotes: int
    candidateCount: int
    status: Optional[str] = None


class Candidate(BaseModel):
    id: int
    name: str
    party: str
    voteCount: int
    imageUrl: str


class ElectionResults(BaseModel):
    election: Election
    candidates: List[Candidate]
    lastUpdate: datetime


# Authentication
def verify_signature(address: str, message: str, signature: str) -> bool:
    try:
        # Fix for Web3.py signature verification
        message_encoded = encode_defunct(text=message)
        # Remove '0x' prefix if present for compatibility
        if signature.startswith('0x'):
            signature = signature[2:]
        # Add '0x' prefix back for proper format
        signature_hex = '0x' + signature
        recovered_address = w3.eth.account.recover_message(message_encoded, signature=signature_hex)
        return recovered_address.lower() == address.lower()
    except Exception as e:
        print(f"Signature verification error: {e}")
        print(f"Address: {address}")
        print(f"Message: {message}")
        print(f"Signature: {signature}")
        return False


# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "Blockchain Voting System API",
        "version": "1.0.0",
        "blockchain_connected": w3.is_connected(),
        "contract_address": CONTRACT_ADDRESS
    }


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate user with MetaMask signature"""
    try:
        # Convert address to checksum format
        address = w3.to_checksum_address(request.address)

        # Verify signature
        if not verify_signature(address, request.message, request.signature):
            raise HTTPException(status_code=401, detail="Invalid signature")

        # Check if contract is loaded
        if not contract:
            print("Contract not loaded, using default admin check")
            # For testing: first account from Ganache is admin
            is_admin = address.lower() == w3.eth.accounts[0].lower() if w3.eth.accounts else False
        else:
            try:
                is_admin = contract.functions.isAdmin(address).call()
            except Exception as e:
                print(f"Contract call error: {e}")
                # Fallback: check if it's the first Ganache account
                is_admin = address.lower() == w3.eth.accounts[0].lower() if w3.eth.accounts else False

        return LoginResponse(
            address=address,
            isAdmin=is_admin,
            authenticated=True
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@app.get("/api/blockchain/status")
async def blockchain_status():
    """Check blockchain connection status"""
    return {
        "connected": w3.is_connected(),
        "chainId": w3.eth.chain_id if w3.is_connected() else None,
        "blockNumber": w3.eth.block_number if w3.is_connected() else None,
        "contractAddress": CONTRACT_ADDRESS
    }


# Election endpoints
@app.post("/api/elections")
async def create_election(election: ElectionCreate):
    """Create a new election (Admin only)"""
    try:
        if not contract:
            raise HTTPException(status_code=503, detail="Smart contract not loaded")

        # Convert address to checksum format
        sender_address = w3.to_checksum_address(election.senderAddress)

        # Check if admin
        try:
            is_admin = contract.functions.isAdmin(sender_address).call()
        except:
            # For testing, allow first account as admin
            is_admin = sender_address.lower() == w3.eth.accounts[0].lower() if w3.eth.accounts else False

        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can create elections")

        # Get transaction count for nonce
        nonce = w3.eth.get_transaction_count(sender_address)

        # Build transaction
        transaction = contract.functions.createElection(
            election.name,
            election.description,
            election.startTime,
            election.endTime
        ).build_transaction({
            'from': sender_address,
            'nonce': nonce,
            'gas': 3000000,
            'gasPrice': w3.to_wei('20', 'gwei')
        })

        # Remove chainId for Ganache compatibility
        if 'chainId' in transaction:
            del transaction['chainId']

        return {"transaction": transaction, "message": "Transaction prepared successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Create election error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/elections", response_model=List[Election])
async def get_elections():
    """Get all elections"""
    try:
        if not contract:
            return []

        election_count = contract.functions.electionCount().call()
        elections = []

        for i in range(1, election_count + 1):
            try:
                election_data = contract.functions.getElection(i).call()
                status = contract.functions.getElectionStatus(i).call()

                elections.append(Election(
                    id=election_data[0],
                    name=election_data[1],
                    description=election_data[2],
                    startTime=election_data[3],
                    endTime=election_data[4],
                    isActive=election_data[5],
                    creator=election_data[6],
                    totalVotes=election_data[7],
                    candidateCount=election_data[8],
                    status=status
                ))
            except Exception as e:
                print(f"Error getting election {i}: {e}")
                continue

        return elections
    except Exception as e:
        print(f"Get elections error: {e}")
        return []


@app.get("/api/elections/{election_id}", response_model=Election)
async def get_election(election_id: int):
    """Get specific election details"""
    try:
        election_data = contract.functions.getElection(election_id).call()
        status = contract.functions.getElectionStatus(election_id).call()

        return Election(
            id=election_data[0],
            name=election_data[1],
            description=election_data[2],
            startTime=election_data[3],
            endTime=election_data[4],
            isActive=election_data[5],
            creator=election_data[6],
            totalVotes=election_data[7],
            candidateCount=election_data[8],
            status=status
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/elections/active", response_model=List[int])
async def get_active_elections():
    """Get active election IDs"""
    try:
        active_ids = contract.functions.getActiveElections().call()
        return active_ids
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Candidate endpoints
@app.post("/api/candidates")
async def add_candidate(candidate: CandidateCreate):
    """Add candidate to election (Admin only)"""
    try:
        # Convert address to checksum format
        sender_address = w3.to_checksum_address(candidate.senderAddress)

        is_admin = contract.functions.isAdmin(sender_address).call()
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can add candidates")

        nonce = w3.eth.get_transaction_count(sender_address)

        transaction = contract.functions.addCandidate(
            candidate.electionId,
            candidate.name,
            candidate.party,
            candidate.imageUrl
        ).build_transaction({
            'from': sender_address,
            'nonce': nonce,
            'gas': 3000000,
            'gasPrice': w3.to_wei('20', 'gwei')
        })

        # Remove chainId for Ganache compatibility
        if 'chainId' in transaction:
            del transaction['chainId']

        return {"transaction": transaction, "message": "Transaction prepared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/elections/{election_id}/candidates", response_model=List[Candidate])
async def get_candidates(election_id: int):
    """Get all candidates for an election"""
    try:
        candidates_data = contract.functions.getAllCandidates(election_id).call()
        candidates = []

        for candidate in candidates_data:
            candidates.append(Candidate(
                id=candidate[0],
                name=candidate[1],
                party=candidate[2],
                voteCount=candidate[3],
                imageUrl=candidate[4]
            ))

        return candidates
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Voter endpoints
@app.post("/api/voters/register")
async def register_voters(voter_reg: VoterRegister):
    """Register voters for election (Admin only)"""
    try:
        # Convert sender address to checksum format
        sender_address = w3.to_checksum_address(voter_reg.senderAddress)

        is_admin = contract.functions.isAdmin(sender_address).call()
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can register voters")

        # Convert all voter addresses to checksum format
        voter_addresses_checksum = [w3.to_checksum_address(addr) for addr in voter_reg.voterAddresses]

        nonce = w3.eth.get_transaction_count(sender_address)

        transaction = contract.functions.registerMultipleVoters(
            voter_reg.electionId,
            voter_addresses_checksum
        ).build_transaction({
            'from': sender_address,
            'nonce': nonce,
            'gas': 3000000,
            'gasPrice': w3.to_wei('20', 'gwei')
        })

        # Remove chainId for Ganache compatibility
        if 'chainId' in transaction:
            del transaction['chainId']

        return {"transaction": transaction, "message": "Transaction prepared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voters/{election_id}/{voter_address}/eligible")
async def check_voter_eligibility(election_id: int, voter_address: str):
    """Check if voter is eligible for election"""
    try:
        # Convert address to checksum format
        voter_address_checksum = w3.to_checksum_address(voter_address)

        is_eligible = contract.functions.isVoterEligible(election_id, voter_address_checksum).call()
        has_voted = contract.functions.hasVoterVoted(election_id, voter_address_checksum).call()

        return {
            "eligible": is_eligible,
            "hasVoted": has_voted,
            "canVote": is_eligible and not has_voted
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Voting endpoint
@app.post("/api/vote")
async def cast_vote(vote: VoteRequest):
    """Cast a vote"""
    try:
        # Convert address to checksum format
        sender_address = w3.to_checksum_address(vote.senderAddress)

        # Check eligibility
        is_eligible = contract.functions.isVoterEligible(vote.electionId, sender_address).call()
        if not is_eligible:
            raise HTTPException(status_code=403, detail="You are not eligible to vote in this election")

        has_voted = contract.functions.hasVoterVoted(vote.electionId, sender_address).call()
        if has_voted:
            raise HTTPException(status_code=400, detail="You have already voted in this election")

        nonce = w3.eth.get_transaction_count(sender_address)

        transaction = contract.functions.vote(
            vote.electionId,
            vote.candidateId
        ).build_transaction({
            'from': sender_address,
            'nonce': nonce,
            'gas': 3000000,
            'gasPrice': w3.to_wei('20', 'gwei')
        })

        # Remove chainId for Ganache compatibility
        if 'chainId' in transaction:
            del transaction['chainId']

        return {"transaction": transaction, "message": "Vote transaction prepared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Results endpoint
@app.get("/api/elections/{election_id}/results", response_model=ElectionResults)
async def get_election_results(election_id: int):
    """Get real-time election results sorted by votes"""
    try:
        if not contract:
            raise HTTPException(status_code=503, detail="Smart contract not loaded")

        # Check if election exists
        election_count = contract.functions.electionCount().call()
        if election_id < 1 or election_id > election_count:
            raise HTTPException(status_code=404, detail=f"Election {election_id} does not exist")

        election_data = contract.functions.getElection(election_id).call()

        # Try to get candidates, handle case where there might be none
        candidates = []
        try:
            results_data = contract.functions.getElectionResults(election_id).call()
            for candidate in results_data:
                candidates.append(Candidate(
                    id=candidate[0],
                    name=candidate[1],
                    party=candidate[2],
                    voteCount=candidate[3],
                    imageUrl=candidate[4] if len(candidate) > 4 else ""
                ))
        except Exception as e:
            if "underflow or overflow" in str(e):
                # No candidates yet, return empty list
                print(f"No candidates for election {election_id}")
            else:
                print(f"Error getting candidates: {e}")

        election = Election(
            id=election_data[0],
            name=election_data[1],
            description=election_data[2],
            startTime=election_data[3],
            endTime=election_data[4],
            isActive=election_data[5],
            creator=election_data[6],
            totalVotes=election_data[7] if len(election_data) > 7 else 0,
            candidateCount=election_data[8] if len(election_data) > 8 else 0
        )

        return ElectionResults(
            election=election,
            candidates=candidates,
            lastUpdate=datetime.now()
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get election results error: {e}")
        # Return a basic response if there's an error
        if "underflow or overflow" in str(e):
            # This typically happens when trying to access an array that's empty
            return ElectionResults(
                election=Election(
                    id=election_id,
                    name="Election",
                    description="",
                    startTime=0,
                    endTime=0,
                    isActive=False,
                    creator="",
                    totalVotes=0,
                    candidateCount=0
                ),
                candidates=[],
                lastUpdate=datetime.now()
            )
        raise HTTPException(status_code=500, detail=str(e))


# Admin endpoints
@app.post("/api/admin/add")
async def add_admin(new_admin: dict):
    """Add new admin (Admin only)"""
    try:
        sender_address = w3.to_checksum_address(new_admin.get('senderAddress'))
        admin_address = w3.to_checksum_address(new_admin.get('adminAddress'))

        is_admin = contract.functions.isAdmin(sender_address).call()
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can add other admins")

        nonce = w3.eth.get_transaction_count(sender_address)

        transaction = contract.functions.addAdmin(admin_address).build_transaction({
            'from': sender_address,
            'nonce': nonce,
            'gas': 3000000,
            'gasPrice': w3.to_wei('20', 'gwei')
        })

        # Remove chainId for Ganache compatibility
        if 'chainId' in transaction:
            del transaction['chainId']

        return {"transaction": transaction, "message": "Admin add transaction prepared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# WebSocket for real-time results
@app.websocket("/ws/results/{election_id}")
async def websocket_results(websocket: WebSocket, election_id: int):
    await manager.connect(websocket)
    connection_alive = True

    try:
        while connection_alive:
            try:
                # Check if websocket is still in active connections
                if websocket not in manager.active_connections:
                    break

                # Check if contract is loaded and election exists
                if contract:
                    election_count = contract.functions.electionCount().call()
                    if election_id > 0 and election_id <= election_count:
                        try:
                            results = await get_election_results(election_id)
                            # Convert to dict and handle datetime serialization
                            results_dict = results.dict()
                            # Convert datetime to ISO format string
                            if 'lastUpdate' in results_dict:
                                results_dict['lastUpdate'] = results_dict['lastUpdate'].isoformat()

                            # Send only if connection is still active
                            await manager.send_personal_message(results_dict, websocket)
                        except Exception as e:
                            if "underflow or overflow" in str(e):
                                # Handle the case where election might not have candidates yet
                                empty_result = {
                                    "election": {
                                        "id": election_id,
                                        "name": "Loading...",
                                        "description": "",
                                        "startTime": 0,
                                        "endTime": 0,
                                        "isActive": False,
                                        "creator": "",
                                        "totalVotes": 0,
                                        "candidateCount": 0
                                    },
                                    "candidates": [],
                                    "lastUpdate": datetime.now().isoformat(),
                                    "info": "No candidates registered yet"
                                }
                                await manager.send_personal_message(empty_result, websocket)
                            else:
                                print(f"Error getting results for election {election_id}: {e}")
                                # Don't send error messages continuously
                                pass
                    else:
                        # Election doesn't exist, send error once and close
                        error_msg = {
                            "error": f"Election {election_id} does not exist",
                            "electionId": election_id
                        }
                        await manager.send_personal_message(error_msg, websocket)
                        connection_alive = False
                        break
                else:
                    # Contract not loaded
                    error_msg = {
                        "error": "Contract not loaded",
                        "electionId": election_id
                    }
                    await manager.send_personal_message(error_msg, websocket)

            except WebSocketDisconnect:
                connection_alive = False
                break
            except ConnectionClosedError:
                connection_alive = False
                break
            except Exception as e:
                print(f"WebSocket error for election {election_id}: {e}")
                connection_alive = False
                break

            # Wait before next update
            await asyncio.sleep(2.5)

    except Exception as e:
        print(f"WebSocket connection error: {e}")
    finally:
        manager.disconnect(websocket)
        print(f"WebSocket disconnected for election {election_id}")


# Background task to broadcast results
async def broadcast_results():
    while True:
        try:
            if not contract:
                await asyncio.sleep(5)
                continue

            try:
                election_count = contract.functions.electionCount().call()

                # Only broadcast if there are elections
                if election_count > 0:
                    for election_id in range(1, min(election_count + 1, 10)):  # Limit to 10 elections for performance
                        try:
                            results = await get_election_results(election_id)
                            results_dict = results.dict()
                            if 'lastUpdate' in results_dict:
                                results_dict['lastUpdate'] = results_dict['lastUpdate'].isoformat()

                            await manager.broadcast({
                                "electionId": election_id,
                                "results": results_dict
                            })
                        except Exception as e:
                            # Skip if election doesn't exist or other error
                            if "does not exist" not in str(e):
                                print(f"Broadcast error for election {election_id}: {e}")
                            pass
            except Exception as e:
                print(f"Error getting election count: {e}")

            await asyncio.sleep(3)
        except Exception as e:
            print(f"Broadcast error: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)




# # main.py
# from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel, Field
# from typing import List, Optional, Dict, Any
# from datetime import datetime
# from web3 import Web3
# from eth_account.messages import encode_defunct
# import json
# import asyncio
# from contextlib import asynccontextmanager
# from dotenv import load_dotenv
# import os
#
# load_dotenv()
#
# # Configuration
# GANACHE_URL = os.getenv("GANACHE_URL")
# CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
# CONTRACT_ABI = []
#
#
# # WebSocket connection manager
# class ConnectionManager:
#     def __init__(self):
#         self.active_connections: List[WebSocket] = []
#
#     async def connect(self, websocket: WebSocket):
#         await websocket.accept()
#         self.active_connections.append(websocket)
#
#     def disconnect(self, websocket: WebSocket):
#         self.active_connections.remove(websocket)
#
#     async def broadcast(self, message: dict):
#         for connection in self.active_connections:
#             try:
#                 await connection.send_json(message)
#             except:
#                 pass
#
#
# manager = ConnectionManager()
#
#
# # Lifespan context manager for background tasks
# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     # Startup
#     task = asyncio.create_task(broadcast_results())
#     yield
#     # Shutdown
#     task.cancel()
#
#
# app = FastAPI(title="Blockchain Voting System API", version="1.0.0", lifespan=lifespan)
#
# # CORS configuration
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:4200"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )
#
# # Web3 connection
# w3 = Web3(Web3.HTTPProvider(GANACHE_URL))
#
#
# # Load contract
# def load_contract():
#     try:
#         with open('./Smart-Contracts/build/contracts/VotingSystem.json', 'r') as file:
#             contract_json = json.load(file)
#             global CONTRACT_ABI, CONTRACT_ADDRESS
#             CONTRACT_ABI = contract_json['abi']
#             # Get deployed address from networks
#             if contract_json.get('networks'):
#                 network_id = list(contract_json['networks'].keys())[0]
#                 CONTRACT_ADDRESS = contract_json['networks'][network_id]['address']
#
#         return w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
#     except Exception as e:
#         print(f"Error loading contract: {e}")
#         return None
#
#
# contract = load_contract()
#
#
# # Pydantic models
# class LoginRequest(BaseModel):
#     address: str
#     signature: str
#     message: str
#
#
# class LoginResponse(BaseModel):
#     address: str
#     isAdmin: bool
#     authenticated: bool
#
#
# class ElectionCreate(BaseModel):
#     name: str
#     description: str
#     startTime: int
#     endTime: int
#     senderAddress: str
#
#
# class CandidateCreate(BaseModel):
#     electionId: int
#     name: str
#     party: str
#     imageUrl: Optional[str] = ""
#     senderAddress: str
#
#
# class VoterRegister(BaseModel):
#     electionId: int
#     voterAddresses: List[str]
#     senderAddress: str
#
#
# class VoteRequest(BaseModel):
#     electionId: int
#     candidateId: int
#     senderAddress: str
#
#
# class Election(BaseModel):
#     id: int
#     name: str
#     description: str
#     startTime: int
#     endTime: int
#     isActive: bool
#     creator: str
#     totalVotes: int
#     candidateCount: int
#     status: Optional[str] = None
#
#
# class Candidate(BaseModel):
#     id: int
#     name: str
#     party: str
#     voteCount: int
#     imageUrl: str
#
#
# class ElectionResults(BaseModel):
#     election: Election
#     candidates: List[Candidate]
#     lastUpdate: datetime
#
#
# # Authentication
# def verify_signature(address: str, message: str, signature: str) -> bool:
#     try:
#         # Fix for Web3.py signature verification
#         message_encoded = encode_defunct(text=message)
#         # Remove '0x' prefix if present for compatibility
#         if signature.startswith('0x'):
#             signature = signature[2:]
#         # Add '0x' prefix back for proper format
#         signature_hex = '0x' + signature
#         recovered_address = w3.eth.account.recover_message(message_encoded, signature=signature_hex)
#         return recovered_address.lower() == address.lower()
#     except Exception as e:
#         print(f"Signature verification error: {e}")
#         print(f"Address: {address}")
#         print(f"Message: {message}")
#         print(f"Signature: {signature}")
#         return False
#
#
# # API Endpoints
# @app.get("/")
# async def root():
#     return {
#         "message": "Blockchain Voting System API",
#         "version": "1.0.0",
#         "blockchain_connected": w3.is_connected(),
#         "contract_address": CONTRACT_ADDRESS
#     }
#
#
# @app.post("/api/auth/login", response_model=LoginResponse)
# async def login(request: LoginRequest):
#     """Authenticate user with MetaMask signature"""
#     try:
#         # Convert address to checksum format
#         address = w3.to_checksum_address(request.address)
#
#         # Verify signature
#         if not verify_signature(address, request.message, request.signature):
#             raise HTTPException(status_code=401, detail="Invalid signature")
#
#         # Check if contract is loaded
#         if not contract:
#             print("Contract not loaded, using default admin check")
#             # For testing: first account from Ganache is admin
#             is_admin = address.lower() == w3.eth.accounts[0].lower() if w3.eth.accounts else False
#         else:
#             try:
#                 is_admin = contract.functions.isAdmin(address).call()
#             except Exception as e:
#                 print(f"Contract call error: {e}")
#                 # Fallback: check if it's the first Ganache account
#                 is_admin = address.lower() == w3.eth.accounts[0].lower() if w3.eth.accounts else False
#
#         return LoginResponse(
#             address=address,
#             isAdmin=is_admin,
#             authenticated=True
#         )
#     except HTTPException:
#         raise
#     except Exception as e:
#         print(f"Login error: {e}")
#         raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
#
#
# @app.get("/api/blockchain/status")
# async def blockchain_status():
#     """Check blockchain connection status"""
#     return {
#         "connected": w3.is_connected(),
#         "chainId": w3.eth.chain_id if w3.is_connected() else None,
#         "blockNumber": w3.eth.block_number if w3.is_connected() else None,
#         "contractAddress": CONTRACT_ADDRESS
#     }
#
#
# # Election endpoints
# @app.post("/api/elections")
# async def create_election(election: ElectionCreate):
#     """Create a new election (Admin only)"""
#     try:
#         if not contract:
#             raise HTTPException(status_code=503, detail="Smart contract not loaded")
#
#         # Convert address to checksum format
#         sender_address = w3.to_checksum_address(election.senderAddress)
#
#         # Check if admin
#         try:
#             is_admin = contract.functions.isAdmin(sender_address).call()
#         except:
#             # For testing, allow first account as admin
#             is_admin = sender_address.lower() == w3.eth.accounts[0].lower() if w3.eth.accounts else False
#
#         if not is_admin:
#             raise HTTPException(status_code=403, detail="Only admins can create elections")
#
#         # Get transaction count for nonce
#         nonce = w3.eth.get_transaction_count(sender_address)
#
#         # Build transaction
#         transaction = contract.functions.createElection(
#             election.name,
#             election.description,
#             election.startTime,
#             election.endTime
#         ).build_transaction({
#             'from': sender_address,
#             'nonce': nonce,
#             'gas': 3000000,
#             'gasPrice': w3.to_wei('20', 'gwei')
#         })
#
#         # Remove chainId for Ganache compatibility
#         if 'chainId' in transaction:
#             del transaction['chainId']
#
#         return {"transaction": transaction, "message": "Transaction prepared successfully"}
#     except HTTPException:
#         raise
#     except Exception as e:
#         print(f"Create election error: {e}")
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# @app.get("/api/elections", response_model=List[Election])
# async def get_elections():
#     """Get all elections"""
#     try:
#         if not contract:
#             return []
#
#         election_count = contract.functions.electionCount().call()
#         elections = []
#
#         for i in range(1, election_count + 1):
#             try:
#                 election_data = contract.functions.getElection(i).call()
#                 status = contract.functions.getElectionStatus(i).call()
#
#                 elections.append(Election(
#                     id=election_data[0],
#                     name=election_data[1],
#                     description=election_data[2],
#                     startTime=election_data[3],
#                     endTime=election_data[4],
#                     isActive=election_data[5],
#                     creator=election_data[6],
#                     totalVotes=election_data[7],
#                     candidateCount=election_data[8],
#                     status=status
#                 ))
#             except Exception as e:
#                 print(f"Error getting election {i}: {e}")
#                 continue
#
#         return elections
#     except Exception as e:
#         print(f"Get elections error: {e}")
#         return []
#
#
# @app.get("/api/elections/{election_id}", response_model=Election)
# async def get_election(election_id: int):
#     """Get specific election details"""
#     try:
#         election_data = contract.functions.getElection(election_id).call()
#         status = contract.functions.getElectionStatus(election_id).call()
#
#         return Election(
#             id=election_data[0],
#             name=election_data[1],
#             description=election_data[2],
#             startTime=election_data[3],
#             endTime=election_data[4],
#             isActive=election_data[5],
#             creator=election_data[6],
#             totalVotes=election_data[7],
#             candidateCount=election_data[8],
#             status=status
#         )
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# @app.get("/api/elections/active", response_model=List[int])
# async def get_active_elections():
#     """Get active election IDs"""
#     try:
#         active_ids = contract.functions.getActiveElections().call()
#         return active_ids
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# # Candidate endpoints
# @app.post("/api/candidates")
# async def add_candidate(candidate: CandidateCreate):
#     """Add candidate to election (Admin only)"""
#     try:
#         # Convert address to checksum format
#         sender_address = w3.to_checksum_address(candidate.senderAddress)
#
#         is_admin = contract.functions.isAdmin(sender_address).call()
#         if not is_admin:
#             raise HTTPException(status_code=403, detail="Only admins can add candidates")
#
#         nonce = w3.eth.get_transaction_count(sender_address)
#
#         transaction = contract.functions.addCandidate(
#             candidate.electionId,
#             candidate.name,
#             candidate.party,
#             candidate.imageUrl
#         ).build_transaction({
#             'from': sender_address,
#             'nonce': nonce,
#             'gas': 3000000,
#             'gasPrice': w3.to_wei('20', 'gwei')
#         })
#
#         # Remove chainId for Ganache compatibility
#         if 'chainId' in transaction:
#             del transaction['chainId']
#
#         return {"transaction": transaction, "message": "Transaction prepared successfully"}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# @app.get("/api/elections/{election_id}/candidates", response_model=List[Candidate])
# async def get_candidates(election_id: int):
#     """Get all candidates for an election"""
#     try:
#         candidates_data = contract.functions.getAllCandidates(election_id).call()
#         candidates = []
#
#         for candidate in candidates_data:
#             candidates.append(Candidate(
#                 id=candidate[0],
#                 name=candidate[1],
#                 party=candidate[2],
#                 voteCount=candidate[3],
#                 imageUrl=candidate[4]
#             ))
#
#         return candidates
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# # Voter endpoints
# @app.post("/api/voters/register")
# async def register_voters(voter_reg: VoterRegister):
#     """Register voters for election (Admin only)"""
#     try:
#         # Convert sender address to checksum format
#         sender_address = w3.to_checksum_address(voter_reg.senderAddress)
#
#         is_admin = contract.functions.isAdmin(sender_address).call()
#         if not is_admin:
#             raise HTTPException(status_code=403, detail="Only admins can register voters")
#
#         # Convert all voter addresses to checksum format
#         voter_addresses_checksum = [w3.to_checksum_address(addr) for addr in voter_reg.voterAddresses]
#
#         nonce = w3.eth.get_transaction_count(sender_address)
#
#         transaction = contract.functions.registerMultipleVoters(
#             voter_reg.electionId,
#             voter_addresses_checksum
#         ).build_transaction({
#             'from': sender_address,
#             'nonce': nonce,
#             'gas': 3000000,
#             'gasPrice': w3.to_wei('20', 'gwei')
#         })
#
#         # Remove chainId for Ganache compatibility
#         if 'chainId' in transaction:
#             del transaction['chainId']
#
#         return {"transaction": transaction, "message": "Transaction prepared successfully"}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# @app.get("/api/voters/{election_id}/{voter_address}/eligible")
# async def check_voter_eligibility(election_id: int, voter_address: str):
#     """Check if voter is eligible for election"""
#     try:
#         # Convert address to checksum format
#         voter_address_checksum = w3.to_checksum_address(voter_address)
#
#         is_eligible = contract.functions.isVoterEligible(election_id, voter_address_checksum).call()
#         has_voted = contract.functions.hasVoterVoted(election_id, voter_address_checksum).call()
#
#         return {
#             "eligible": is_eligible,
#             "hasVoted": has_voted,
#             "canVote": is_eligible and not has_voted
#         }
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# # Voting endpoint
# @app.post("/api/vote")
# async def cast_vote(vote: VoteRequest):
#     """Cast a vote"""
#     try:
#         # Convert address to checksum format
#         sender_address = w3.to_checksum_address(vote.senderAddress)
#
#         # Check eligibility
#         is_eligible = contract.functions.isVoterEligible(vote.electionId, sender_address).call()
#         if not is_eligible:
#             raise HTTPException(status_code=403, detail="You are not eligible to vote in this election")
#
#         has_voted = contract.functions.hasVoterVoted(vote.electionId, sender_address).call()
#         if has_voted:
#             raise HTTPException(status_code=400, detail="You have already voted in this election")
#
#         nonce = w3.eth.get_transaction_count(sender_address)
#
#         transaction = contract.functions.vote(
#             vote.electionId,
#             vote.candidateId
#         ).build_transaction({
#             'from': sender_address,
#             'nonce': nonce,
#             'gas': 3000000,
#             'gasPrice': w3.to_wei('20', 'gwei')
#         })
#
#         # Remove chainId for Ganache compatibility
#         if 'chainId' in transaction:
#             del transaction['chainId']
#
#         return {"transaction": transaction, "message": "Vote transaction prepared successfully"}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# # Results endpoint
# @app.get("/api/elections/{election_id}/results", response_model=ElectionResults)
# async def get_election_results(election_id: int):
#     """Get real-time election results sorted by votes"""
#     try:
#         if not contract:
#             raise HTTPException(status_code=503, detail="Smart contract not loaded")
#
#         # Check if election exists
#         election_count = contract.functions.electionCount().call()
#         if election_id < 1 or election_id > election_count:
#             raise HTTPException(status_code=404, detail=f"Election {election_id} does not exist")
#
#         election_data = contract.functions.getElection(election_id).call()
#         results_data = contract.functions.getElectionResults(election_id).call()
#
#         election = Election(
#             id=election_data[0],
#             name=election_data[1],
#             description=election_data[2],
#             startTime=election_data[3],
#             endTime=election_data[4],
#             isActive=election_data[5],
#             creator=election_data[6],
#             totalVotes=election_data[7],
#             candidateCount=election_data[8]
#         )
#
#         candidates = []
#         for candidate in results_data:
#             candidates.append(Candidate(
#                 id=candidate[0],
#                 name=candidate[1],
#                 party=candidate[2],
#                 voteCount=candidate[3],
#                 imageUrl=candidate[4] if len(candidate) > 4 else ""
#             ))
#
#         return ElectionResults(
#             election=election,
#             candidates=candidates,
#             lastUpdate=datetime.now()
#         )
#     except HTTPException:
#         raise
#     except Exception as e:
#         print(f"Get election results error: {e}")
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# # Admin endpoints
# @app.post("/api/admin/add")
# async def add_admin(new_admin: dict):
#     """Add new admin (Admin only)"""
#     try:
#         sender_address = w3.to_checksum_address(new_admin.get('senderAddress'))
#         admin_address = w3.to_checksum_address(new_admin.get('adminAddress'))
#
#         is_admin = contract.functions.isAdmin(sender_address).call()
#         if not is_admin:
#             raise HTTPException(status_code=403, detail="Only admins can add other admins")
#
#         nonce = w3.eth.get_transaction_count(sender_address)
#
#         transaction = contract.functions.addAdmin(admin_address).build_transaction({
#             'from': sender_address,
#             'nonce': nonce,
#             'gas': 3000000,
#             'gasPrice': w3.to_wei('20', 'gwei')
#         })
#
#         # Remove chainId for Ganache compatibility
#         if 'chainId' in transaction:
#             del transaction['chainId']
#
#         return {"transaction": transaction, "message": "Admin add transaction prepared"}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#
#
# # WebSocket for real-time results
# @app.websocket("/ws/results/{election_id}")
# async def websocket_results(websocket: WebSocket, election_id: int):
#     await manager.connect(websocket)
#     try:
#         while True:
#             try:
#                 # Check if contract is loaded and election exists
#                 if contract:
#                     election_count = contract.functions.electionCount().call()
#                     if election_id > 0 and election_id <= election_count:
#                         results = await get_election_results(election_id)
#                         await websocket.send_json(results.dict())
#                     else:
#                         await websocket.send_json({
#                             "error": f"Election {election_id} does not exist",
#                             "electionId": election_id
#                         })
#                 else:
#                     await websocket.send_json({
#                         "error": "Contract not loaded",
#                         "electionId": election_id
#                     })
#             except Exception as e:
#                 print(f"WebSocket error for election {election_id}: {e}")
#                 await websocket.send_json({
#                     "error": str(e),
#                     "electionId": election_id
#                 })
#
#             await asyncio.sleep(2.5)
#
#     except WebSocketDisconnect:
#         manager.disconnect(websocket)
#     except Exception as e:
#         print(f"WebSocket error: {e}")
#         manager.disconnect(websocket)
#
#
# # Background task to broadcast results
# async def broadcast_results():
#     while True:
#         try:
#             if not contract:
#                 await asyncio.sleep(5)
#                 continue
#
#             election_count = contract.functions.electionCount().call()
#
#             # Only broadcast if there are elections
#             if election_count > 0:
#                 for election_id in range(1, election_count + 1):
#                     try:
#                         results = await get_election_results(election_id)
#                         await manager.broadcast({
#                             "electionId": election_id,
#                             "results": results.dict()
#                         })
#                     except Exception as e:
#                         # Skip if election doesn't exist or other error
#                         pass
#
#             await asyncio.sleep(3)
#         except Exception as e:
#             print(f"Broadcast error: {e}")
#             await asyncio.sleep(5)
#
#
# if __name__ == "__main__":
#     import uvicorn
#
#     uvicorn.run(app, host="0.0.0.0", port=8000)