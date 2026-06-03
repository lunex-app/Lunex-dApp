// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract LunexStream {
    enum StreamType {
        Linear,
        Cliff,
        Vesting,
        Unlock
    }

    struct Stream {
        address sender;
        address recipient;
        address token;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint64 startTime;
        uint64 endTime;
        uint64 cliffTime;
        uint64 releaseFrequency;
        StreamType streamType;
        bool cancelable;
        bool transferable;
        bool recipientCanClaimAnytime;
        bool cancelled;
    }

    uint256 public nextStreamId;
    mapping(uint256 => Stream) public streams;

    event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, address token, uint256 amount);
    event StreamBatchCreated(address indexed sender, uint256 count, uint256 totalAmount);
    event Claimed(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed streamId, uint256 refunded);
    event RecipientChanged(uint256 indexed streamId, address indexed oldRecipient, address indexed newRecipient);

    function createStream(
        address recipient,
        address token,
        uint256 totalAmount,
        uint64 startTime,
        uint64 endTime,
        uint64 cliffTime,
        uint64 releaseFrequency,
        StreamType streamType,
        bool cancelable,
        bool transferable,
        bool recipientCanClaimAnytime
    ) external returns (uint256 streamId) {
        require(recipient != address(0), "recipient");
        require(totalAmount > 0, "amount");
        require(endTime > startTime, "time");
        IERC20(token).transferFrom(msg.sender, address(this), totalAmount);

        streamId = ++nextStreamId;
        streams[streamId] = Stream({
            sender: msg.sender,
            recipient: recipient,
            token: token,
            totalAmount: totalAmount,
            claimedAmount: 0,
            startTime: startTime,
            endTime: endTime,
            cliffTime: cliffTime,
            releaseFrequency: releaseFrequency,
            streamType: streamType,
            cancelable: cancelable,
            transferable: transferable,
            recipientCanClaimAnytime: recipientCanClaimAnytime,
            cancelled: false
        });

        emit StreamCreated(streamId, msg.sender, recipient, token, totalAmount);
    }

    function createStreams(
        address[] calldata recipients,
        uint256[] calldata amounts,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint64 cliffTime,
        uint64 releaseFrequency,
        StreamType streamType,
        bool cancelable,
        bool transferable,
        bool recipientCanClaimAnytime
    ) external returns (uint256[] memory streamIds) {
        require(recipients.length > 0, "recipients");
        require(recipients.length == amounts.length, "length");
        require(endTime > startTime, "time");

        uint256 totalAmount;
        streamIds = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "recipient");
            require(amounts[i] > 0, "amount");
            totalAmount += amounts[i];
        }

        IERC20(token).transferFrom(msg.sender, address(this), totalAmount);

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 streamId = ++nextStreamId;
            streamIds[i] = streamId;
            streams[streamId] = Stream({
                sender: msg.sender,
                recipient: recipients[i],
                token: token,
                totalAmount: amounts[i],
                claimedAmount: 0,
                startTime: startTime,
                endTime: endTime,
                cliffTime: cliffTime,
                releaseFrequency: releaseFrequency,
                streamType: streamType,
                cancelable: cancelable,
                transferable: transferable,
                recipientCanClaimAnytime: recipientCanClaimAnytime,
                cancelled: false
            });
            emit StreamCreated(streamId, msg.sender, recipients[i], token, amounts[i]);
        }

        emit StreamBatchCreated(msg.sender, recipients.length, totalAmount);
    }

    function vestedAmount(uint256 streamId, uint256 timestamp) public view returns (uint256) {
        Stream memory stream = streams[streamId];
        if (stream.cancelled || timestamp < stream.startTime) return 0;
        if (stream.cliffTime > 0 && timestamp < stream.cliffTime) return 0;
        if (timestamp >= stream.endTime) return stream.totalAmount;
        if (stream.streamType == StreamType.Unlock) return 0;
        if (stream.streamType == StreamType.Cliff) {
            uint256 unlockTime = stream.cliffTime > 0 ? stream.cliffTime : stream.endTime;
            return timestamp >= unlockTime ? stream.totalAmount : 0;
        }

        uint256 effectiveTime = timestamp;
        if (stream.releaseFrequency > 1) {
            uint256 elapsed = timestamp - stream.startTime;
            effectiveTime = stream.startTime + ((elapsed / stream.releaseFrequency) * stream.releaseFrequency);
        }
        return (stream.totalAmount * (effectiveTime - stream.startTime)) / (stream.endTime - stream.startTime);
    }

    function claimable(uint256 streamId) public view returns (uint256) {
        Stream memory stream = streams[streamId];
        uint256 vested = vestedAmount(streamId, block.timestamp);
        if (vested <= stream.claimedAmount) return 0;
        return vested - stream.claimedAmount;
    }

    function claim(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        require(!stream.cancelled, "cancelled");
        require(msg.sender == stream.recipient, "recipient");
        if (!stream.recipientCanClaimAnytime) require(block.timestamp >= stream.endTime, "locked");
        uint256 amount = claimable(streamId);
        require(amount > 0, "claimable");
        stream.claimedAmount += amount;
        IERC20(stream.token).transfer(stream.recipient, amount);
        emit Claimed(streamId, stream.recipient, amount);
    }

    function cancel(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        require(stream.cancelable, "locked");
        require(stream.sender == msg.sender, "sender");
        require(!stream.cancelled, "cancelled");

        uint256 claimableNow = claimable(streamId);
        uint256 refund = stream.totalAmount - stream.claimedAmount - claimableNow;
        stream.cancelled = true;
        stream.claimedAmount += claimableNow;

        if (claimableNow > 0) IERC20(stream.token).transfer(stream.recipient, claimableNow);
        if (refund > 0) IERC20(stream.token).transfer(stream.sender, refund);
        emit Cancelled(streamId, refund);
    }

    function transferRecipient(uint256 streamId, address newRecipient) external {
        Stream storage stream = streams[streamId];
        require(stream.transferable, "transfer locked");
        require(msg.sender == stream.recipient, "recipient");
        require(newRecipient != address(0), "new recipient");
        address oldRecipient = stream.recipient;
        stream.recipient = newRecipient;
        emit RecipientChanged(streamId, oldRecipient, newRecipient);
    }
}
