// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IStableSwap} from "./interfaces/IStableSwap.sol";

contract LunexLimitOrderKeeper {
    enum Direction {
        Below,
        Above
    }

    struct Order {
        address owner;
        uint8 tokenInIndex;
        uint8 tokenOutIndex;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 targetRateE18;
        Direction direction;
        bool active;
    }

    IStableSwap public immutable pool;
    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;

    event OrderCreated(uint256 indexed orderId, address indexed owner, address tokenIn, address tokenOut, uint256 amountIn, uint256 targetRateE18);
    event OrderCancelled(uint256 indexed orderId);
    event OrderExecuted(uint256 indexed orderId, address indexed keeper, uint256 amountOut);

    constructor(address pool_) {
        pool = IStableSwap(pool_);
    }

    function createOrder(
        uint8 tokenInIndex,
        uint8 tokenOutIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 targetRateE18,
        Direction direction
    ) external returns (uint256 orderId) {
        require(tokenIn != address(0) && tokenOut != address(0), "token");
        require(amountIn > 0, "amount");
        require(targetRateE18 > 0, "rate");
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        orderId = ++nextOrderId;
        orders[orderId] = Order({
            owner: msg.sender,
            tokenInIndex: tokenInIndex,
            tokenOutIndex: tokenOutIndex,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            targetRateE18: targetRateE18,
            direction: direction,
            active: true
        });

        emit OrderCreated(orderId, msg.sender, tokenIn, tokenOut, amountIn, targetRateE18);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.active, "inactive");
        require(order.owner == msg.sender, "owner");
        order.active = false;
        IERC20(order.tokenIn).transfer(order.owner, order.amountIn);
        emit OrderCancelled(orderId);
    }

    function canExecute(uint256 orderId) public view returns (bool, uint256 quote, uint256 rateE18) {
        Order memory order = orders[orderId];
        if (!order.active || order.amountIn == 0) return (false, 0, 0);
        quote = pool.get_dy(order.tokenInIndex, order.tokenOutIndex, order.amountIn);
        rateE18 = (quote * 1e18) / order.amountIn;
        bool rateOk = order.direction == Direction.Below ? rateE18 <= order.targetRateE18 : rateE18 >= order.targetRateE18;
        return (rateOk && quote >= order.minAmountOut, quote, rateE18);
    }

    function executeOrder(uint256 orderId) external returns (uint256 amountOut) {
        Order storage order = orders[orderId];
        require(order.active, "inactive");
        (bool executable,,) = canExecute(orderId);
        require(executable, "condition");

        order.active = false;
        IERC20(order.tokenIn).approve(address(pool), order.amountIn);
        amountOut = pool.exchange(order.tokenInIndex, order.tokenOutIndex, order.amountIn, order.minAmountOut);
        IERC20(order.tokenOut).transfer(order.owner, amountOut);
        emit OrderExecuted(orderId, msg.sender, amountOut);
    }
}
