// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract LunexNativeTopUpRelayer {
    address public owner;
    address public treasury;
    mapping(bytes32 => bool) public deliveredRequests;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event NativeFunded(address indexed sender, uint256 amount);
    event TopUpDelivered(
        bytes32 indexed requestId,
        address indexed recipient,
        address indexed token,
        uint256 recipientTokenAmount,
        uint256 treasuryTokenAmount,
        uint256 nativeAmount
    );
    event TreasuryUpdated(address indexed treasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    constructor(address treasury_) {
        owner = msg.sender;
        treasury = treasury_;
    }

    receive() external payable {
        emit NativeFunded(msg.sender, msg.value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function deliverTopUp(
        bytes32 requestId,
        address token,
        address recipient,
        uint256 recipientTokenAmount,
        uint256 treasuryTokenAmount,
        uint256 nativeAmount
    ) external onlyOwner {
        require(!deliveredRequests[requestId], "delivered");
        require(token != address(0), "token");
        require(recipient != address(0), "recipient");
        deliveredRequests[requestId] = true;

        if (recipientTokenAmount > 0) IERC20(token).transfer(recipient, recipientTokenAmount);
        if (treasuryTokenAmount > 0) IERC20(token).transfer(treasury, treasuryTokenAmount);
        if (nativeAmount > 0) {
            require(address(this).balance >= nativeAmount, "funds");
            (bool ok,) = recipient.call{value: nativeAmount}("");
            require(ok, "native");
        }
        emit TopUpDelivered(requestId, recipient, token, recipientTokenAmount, treasuryTokenAmount, nativeAmount);
    }

    function sweepToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to");
        IERC20(token).transfer(to, amount);
    }

    function sweepNative(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "to");
        require(address(this).balance >= amount, "funds");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "native");
    }
}
