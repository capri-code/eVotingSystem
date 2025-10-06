// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract VotingSystem {
    // Struktura per kandidatin
    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
        string imageUrl;
    }

    // Struktura per zgjedhjet
    struct Election {
        uint256 id;
        string name;
        string description;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        address creator;
        uint256 totalVotes;
        uint256 candidateCount;
    }

    // Struktura per votuesin
    struct Voter {
        address voterAddress;
        string name;
        bool isRegistered;
    }

    // Mappings
    mapping(uint256 => Election) public elections;
    mapping(uint256 => mapping(uint256 => Candidate)) public candidates;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public eligibleVoters;
    mapping(uint256 => mapping(address => uint256)) public voterChoice;
    mapping(address => bool) public admins;

    // Arrays dhe counters
    uint256 public electionCount = 0;
    uint256[] public activeElectionIds;

    // Events
    event ElectionCreated(uint256 indexed electionId, string name, address creator);
    event CandidateAdded(uint256 indexed electionId, uint256 candidateId, string name);
    event VoterRegistered(uint256 indexed electionId, address voter);
    event VoteCast(uint256 indexed electionId, address voter, uint256 candidateId);
    event ElectionStatusChanged(uint256 indexed electionId, bool isActive);
    event AdminAdded(address admin);
    event AdminRemoved(address admin);

    // Modifiers
    modifier onlyAdmin() {
        require(admins[msg.sender], "Only admin can perform this action");
        _;
    }

    modifier electionExists(uint256 _electionId) {
        require(_electionId > 0 && _electionId <= electionCount, "Election does not exist");
        _;
    }

    modifier electionActive(uint256 _electionId) {
        require(elections[_electionId].isActive, "Election is not active");
        require(block.timestamp >= elections[_electionId].startTime, "Election has not started");
        require(block.timestamp <= elections[_electionId].endTime, "Election has ended");
        _;
    }

    // Constructor
    constructor() {
        admins[msg.sender] = true;
        emit AdminAdded(msg.sender);
    }

    // Admin Management
    function addAdmin(address _admin) external onlyAdmin {
        require(!admins[_admin], "Already an admin");
        admins[_admin] = true;
        emit AdminAdded(_admin);
    }

    function removeAdmin(address _admin) external onlyAdmin {
        require(_admin != msg.sender, "Cannot remove yourself");
        require(admins[_admin], "Not an admin");
        admins[_admin] = false;
        emit AdminRemoved(_admin);
    }

    function isAdmin(address _address) external view returns (bool) {
        return admins[_address];
    }

    // Election Management
    function createElection(
        string memory _name,
        string memory _description,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyAdmin returns (uint256) {
        require(_startTime < _endTime, "Invalid time range");
        require(_startTime >= block.timestamp, "Start time must be in future");

        electionCount++;

        elections[electionCount] = Election({
            id: electionCount,
            name: _name,
            description: _description,
            startTime: _startTime,
            endTime: _endTime,
            isActive: true,
            creator: msg.sender,
            totalVotes: 0,
            candidateCount: 0
        });

        activeElectionIds.push(electionCount);

        emit ElectionCreated(electionCount, _name, msg.sender);
        return electionCount;
    }

    function toggleElectionStatus(uint256 _electionId)
        external
        onlyAdmin
        electionExists(_electionId)
    {
        elections[_electionId].isActive = !elections[_electionId].isActive;

        // Update active elections array
        if (!elections[_electionId].isActive) {
            removeFromActiveElections(_electionId);
        } else {
            activeElectionIds.push(_electionId);
        }

        emit ElectionStatusChanged(_electionId, elections[_electionId].isActive);
    }

    // Candidate Management
    function addCandidate(
        uint256 _electionId,
        string memory _name,
        string memory _party,
        string memory _imageUrl
    ) external onlyAdmin electionExists(_electionId) {
        Election storage election = elections[_electionId];
        election.candidateCount++;

        candidates[_electionId][election.candidateCount] = Candidate({
            id: election.candidateCount,
            name: _name,
            party: _party,
            voteCount: 0,
            imageUrl: _imageUrl
        });

        emit CandidateAdded(_electionId, election.candidateCount, _name);
    }

    // Voter Management
    function registerVoter(uint256 _electionId, address _voterAddress)
        external
        onlyAdmin
        electionExists(_electionId)
    {
        require(!eligibleVoters[_electionId][_voterAddress], "Voter already registered");

        eligibleVoters[_electionId][_voterAddress] = true;
        emit VoterRegistered(_electionId, _voterAddress);
    }

    function registerMultipleVoters(uint256 _electionId, address[] memory _voters)
        external
        onlyAdmin
        electionExists(_electionId)
    {
        for (uint256 i = 0; i < _voters.length; i++) {
            if (!eligibleVoters[_electionId][_voters[i]]) {
                eligibleVoters[_electionId][_voters[i]] = true;
                emit VoterRegistered(_electionId, _voters[i]);
            }
        }
    }

    // Voting
    function vote(uint256 _electionId, uint256 _candidateId)
        external
        electionExists(_electionId)
        electionActive(_electionId)
    {
        require(eligibleVoters[_electionId][msg.sender], "You are not eligible to vote");
        require(!hasVoted[_electionId][msg.sender], "You have already voted");
        require(_candidateId > 0 && _candidateId <= elections[_electionId].candidateCount, "Invalid candidate");

        hasVoted[_electionId][msg.sender] = true;
        voterChoice[_electionId][msg.sender] = _candidateId;
        candidates[_electionId][_candidateId].voteCount++;
        elections[_electionId].totalVotes++;

        emit VoteCast(_electionId, msg.sender, _candidateId);
    }

    // View Functions
    function getElection(uint256 _electionId)
        external
        view
        electionExists(_electionId)
        returns (Election memory)
    {
        return elections[_electionId];
    }

    function getCandidate(uint256 _electionId, uint256 _candidateId)
        external
        view
        electionExists(_electionId)
        returns (Candidate memory)
    {
        require(_candidateId > 0 && _candidateId <= elections[_electionId].candidateCount, "Invalid candidate");
        return candidates[_electionId][_candidateId];
    }

    function getAllCandidates(uint256 _electionId)
        external
        view
        electionExists(_electionId)
        returns (Candidate[] memory)
    {
        uint256 candidateCount = elections[_electionId].candidateCount;
        Candidate[] memory allCandidates = new Candidate[](candidateCount);

        for (uint256 i = 1; i <= candidateCount; i++) {
            allCandidates[i - 1] = candidates[_electionId][i];
        }

        return allCandidates;
    }

    function getActiveElections() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < activeElectionIds.length; i++) {
            if (elections[activeElectionIds[i]].isActive) {
                activeCount++;
            }
        }

        uint256[] memory active = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < activeElectionIds.length; i++) {
            if (elections[activeElectionIds[i]].isActive) {
                active[index] = activeElectionIds[i];
                index++;
            }
        }

        return active;
    }

    function isVoterEligible(uint256 _electionId, address _voter)
        external
        view
        electionExists(_electionId)
        returns (bool)
    {
        return eligibleVoters[_electionId][_voter];
    }

    function hasVoterVoted(uint256 _electionId, address _voter)
        external
        view
        electionExists(_electionId)
        returns (bool)
    {
        return hasVoted[_electionId][_voter];
    }

    function getVoterChoice(uint256 _electionId, address _voter)
        external
        view
        electionExists(_electionId)
        returns (uint256)
    {
        require(hasVoted[_electionId][_voter], "Voter has not voted");
        return voterChoice[_electionId][_voter];
    }

    function getElectionResults(uint256 _electionId)
        external
        view
        electionExists(_electionId)
        returns (Candidate[] memory)
    {
        uint256 candidateCount = elections[_electionId].candidateCount;

        // Handle case where there are no candidates
        if (candidateCount == 0) {
            return new Candidate[](0);
        }

        Candidate[] memory results = new Candidate[](candidateCount);

        // Copy candidates to results array
        for (uint256 i = 0; i < candidateCount; i++) {
            results[i] = candidates[_electionId][i + 1];
        }

        // Sort by vote count (bubble sort) - stable sort to preserve order in ties
        for (uint256 i = 0; i < candidateCount - 1; i++) {
            for (uint256 j = 0; j < candidateCount - i - 1; j++) {
                if (results[j].voteCount < results[j + 1].voteCount) {
                    Candidate memory temp = results[j];
                    results[j] = results[j + 1];
                    results[j + 1] = temp;
                }
            }
        }

        return results;
    }

    // Helper Functions
    function removeFromActiveElections(uint256 _electionId) private {
        for (uint256 i = 0; i < activeElectionIds.length; i++) {
            if (activeElectionIds[i] == _electionId) {
                activeElectionIds[i] = activeElectionIds[activeElectionIds.length - 1];
                activeElectionIds.pop();
                break;
            }
        }
    }

    function getElectionStatus(uint256 _electionId)
        external
        view
        electionExists(_electionId)
        returns (string memory)
    {
        Election memory election = elections[_electionId];

        if (!election.isActive) {
            return "Inactive";
        }

        if (block.timestamp < election.startTime) {
            return "Not Started";
        }

        if (block.timestamp > election.endTime) {
            return "Ended";
        }

        return "Active";
    }
}