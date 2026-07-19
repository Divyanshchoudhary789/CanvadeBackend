const express = require("express");
const router = express.Router();

const AuthMiddleware = require("../../middleware/auth");
const CartController = require("../../controllers/student/cart.controller");

router.post("/add", AuthMiddleware, CartController.addToCart);
router.get("/getItems", AuthMiddleware, CartController.getCartItems);
router.delete("/remove", AuthMiddleware, CartController.removeFromCart);
module.exports = router;