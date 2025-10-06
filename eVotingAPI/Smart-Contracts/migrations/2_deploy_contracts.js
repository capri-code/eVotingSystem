const VotingSystem = artifacts.require("VotingSystem");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(VotingSystem).then(function(instance) {
    console.log("VotingSystem deployed at:", instance.address);
    console.log("Admin account:", accounts[0]);
  });
};