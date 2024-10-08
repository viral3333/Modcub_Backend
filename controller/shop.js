const express = require("express");
const path = require("path");
const router = express.Router();
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail");
const Shop = require("../model/shop");
const Product = require("../model/product");
const { isAuthenticated, isSeller, isAdmin } = require("../middleware/auth");
const cloudinary = require("cloudinary").v2;
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const sendShopToken = require("../utils/shopToken");
const Razorpay = require("razorpay");
require("dotenv").config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID, // Replace with your Razorpay key id
    key_secret: process.env.RAZORPAY_SECRET, // Replace with your Razorpay key secret
});
//create cloudinary config and signature
const timestamp = Math.round(new Date().getTime() / 1000);
cloudinary.config({
    cloud_name:process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})
const signature=cloudinary.utils.api_sign_request({
    folder:'avatars',
    timestamp:timestamp
},process.env.CLOUDINARY_API_SECRET)

// create shop
router.post(
    "/create-shop",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { email,avatar } = req.body;
            console.log(avatar)
            const sellerEmail = await Shop.findOne({ email });
            if (sellerEmail) {
                return next(new ErrorHandler("User already exists", 400));
            }
            
            //create a dummy avatar for each user 
            let avatar1={
                public_id:"123",
                url:"https://pixabay.com/vectors/businessman-male-business-avatar-310819/"
            }
            if(avatar){
                const  result=await cloudinary.uploader.upload(avatar,{
                    folder: "avatars",
                    api_key: process.env.CLOUDINARY_API_KEY,
                    timestamp: timestamp,
                    signature: signature
                 })
                  // Update avatar object with Cloudinary response
                avatar1 = {
                    public_id: result.public_id,
                    url: result.secure_url,
                };
            }
            console.log(avatar1)
            // const myCloud = await cloudinary.v2.uploader.upload(req.body.avatar, {
            //   folder: "avatars",
            // });

            const currentDate = new Date();
            const expirationDate = new Date(
                currentDate.setMonth(currentDate.getMonth() + 1)
            );

            // console.log(expirationDate);

            const seller = {
                name: req.body.name,
                email: email,
                password: req.body.password,
                avatar: avatar1,
                address: req.body.address,
                phoneNumber: req.body.phoneNumber,
                zipCode: req.body.zipCode,
                expirationDate: expirationDate, // Injecting expirationDate into the seller object
            };

            const activationToken = createActivationToken(seller);

            const activationUrl = `https://modcub.in/seller/activation/${activationToken}`;

            try {
                await sendMail({
                    email: seller.email,
                    subject: "Activate your Shop",
                    message: `Hello ${seller.name}, please click on the link to activate your shop: ${activationUrl}`,
                });
                res.status(201).json({
                    success: true,
                    message: `please check your email:- ${seller.email} to activate your shop!`,
                });
            } catch (error) {
                return next(new ErrorHandler(error.message, 500));
            }
        } catch (error) {
            return next(new ErrorHandler(error.message, 400));
        }
    })
);

// create activation token
const createActivationToken = (seller) => {
    return jwt.sign(seller, process.env.ACTIVATION_SECRET, {
        expiresIn: "360m",
    });
};

// activate user
router.post(
    "/activation",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { activation_token } = req.body;

            const newSeller = jwt.verify(
                activation_token,
                process.env.ACTIVATION_SECRET
            );

            if (!newSeller) {
                return next(new ErrorHandler("Invalid token", 400));
            }
            const {
                name,
                email,
                password,
                avatar,
                zipCode,
                address,
                expirationDate, // Retrieve expirationDate from the token payload
                phoneNumber,
            } = newSeller;

            let seller = await Shop.findOne({ email });

            if (seller) {
                return next(new ErrorHandler("User already exists", 400));
            }

            seller = new Shop({
                name,
                email,
                avatar,
                password,
                zipCode,
                address,
                expirationDate, // Assigning expirationDate to the new seller
                phoneNumber,
            });

            seller.save();
            sendShopToken(seller, 201, res);
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// login shop
router.post(
    "/login-shop",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return next(
                    new ErrorHandler("Please provide the all fields!", 400)
                );
            }

            const user = await Shop.findOne({ email }).select("+password");

            if (!user) {
                return next(new ErrorHandler("User doesn't exists!", 400));
            }

            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                return next(
                    new ErrorHandler(
                        "Please provide the correct information",
                        400
                    )
                );
            }

            sendShopToken(user, 201, res);
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// load shop
router.get(
    "/getSeller",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const seller = await Shop.findById(req.seller._id);

            if (!seller) {
                return next(new ErrorHandler("User doesn't exists", 400));
            }

            res.status(200).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// log out from shop
router.get(
    "/logout",
    catchAsyncErrors(async (req, res, next) => {
        try {
            res.clearCookie("seller_token", {
                httpOnly: true,
                sameSite: "none",
                secure: true,
            });
            res.status(201).json({
                success: true,
                message: "Log out successful!",
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// get shop info
router.get(
    "/get-shop-info/:id",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const shop = await Shop.findById(req.params.id);
            res.status(201).json({
                success: true,
                shop,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// update shop profile picture
router.put(
    "/update-shop-avatar",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            let existsSeller = await Shop.findById(req.seller._id);

            if (existsSeller.avatar.public_id) {
                const imageId = existsSeller.avatar.public_id;
                await cloudinary.uploader.destroy(imageId);
            }

            const myCloud = await cloudinary.uploader.upload(
                req.body.avatar,
                {
                    folder: "avatars",
                    api_key: process.env.CLOUDINARY_API_KEY,
                    timestamp: timestamp,
                    signature: signature
                }
            );

            existsSeller.avatar = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url,
            };

            await existsSeller.save();

            res.status(200).json({
                success: true,
                seller: existsSeller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// update seller info
router.put(
    "/update-seller-info",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { name, description, address, phoneNumber, zipCode } =
                req.body;

            const shop = await Shop.findOne(req.seller._id);

            if (!shop) {
                return next(new ErrorHandler("User not found", 400));
            }

            shop.name = name;
            shop.description = description;
            shop.address = address;
            shop.phoneNumber = phoneNumber;
            shop.zipCode = zipCode;

            await shop.save();

            res.status(201).json({
                success: true,
                shop,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// all sellers --- for admin
router.get(
    "/admin-all-sellers",
    isAuthenticated,
    isAdmin("Admin", "SuperAdmin"),

    catchAsyncErrors(async (req, res, next) => {
        try {
            const sellers = await Shop.find().sort({
                createdAt: -1,
            });
            res.status(201).json({
                success: true,
                sellers,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// delete seller ---admin
router.delete(
    "/delete-seller/:id",
    isAuthenticated,
    isAdmin("Admin", "SuperAdmin"),

    catchAsyncErrors(async (req, res, next) => {
        try {
            const seller = await Shop.findById(req.params.id);

            if (!seller) {
                return next(
                    new ErrorHandler(
                        "Seller is not available with this id",
                        400
                    )
                );
            }

            await Shop.findByIdAndDelete(req.params.id);

            res.status(201).json({
                success: true,
                message: "Seller deleted successfully!",
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// update seller withdraw methods --- sellers
router.put(
    "/update-payment-methods",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { withdrawMethod } = req.body;

            const seller = await Shop.findByIdAndUpdate(req.seller._id, {
                withdrawMethod,
            });

            res.status(201).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

router.post(
    "/renew-subscription",
    catchAsyncErrors(async (req, res, next) => {
        const { amount } = req.body;
        try {
            const options = {
                amount: amount * 100, // amount in paise
                currency: "INR",
                receipt: "order_rcptid_11", // Replace with your receipt ID
            };

            const order = await razorpay.orders.create(options);
            // console.log("dejhvfjehyw", order);
            res.status(200).json({ order });
        } catch (error) {
            // console.error("Error creating order:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    })
);

router.put(
    "/update-expiration",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { sellerId, months } = req.body;

            // Find the seller by ID
            const seller = await Shop.findById(sellerId);

            if (!seller) {
                return next(new ErrorHandler("Seller not found", 404));
            }

            // Calculate the new expiration date
            const currentExpirationDate = new Date(seller.expirationDate);
            const newExpirationDate = new Date(
                currentExpirationDate.setMonth(
                    currentExpirationDate.getMonth() + months
                )
            );

            // Update the expiration date in the database for the seller
            seller.expirationDate = newExpirationDate;
            await seller.save();

            // Update the expiration date in all products where shopId is equal to sellerId
            await Product.updateMany(
                { shopId: sellerId },
                { $set: { "shop.expirationDate": newExpirationDate } }
            );

            res.status(200).json({
                success: true,
                message: "Expiration date updated successfully",
                newExpirationDate,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// Add this code to your existing routes file

// Suspend seller
router.put(
    "/suspend-seller/:id",
    // isAuthenticated,
    // isAdmin("Admin", "SuperAdmin"),
    catchAsyncErrors(async (req, res, next) => {
        // console.log("-----------------------------------------");
        try {
            const { id } = req.params;
            // console.log(id);
            // Find the seller by ID
            const seller = await Shop.findById(id);

            // console.log(seller);
            if (!seller) {
                return next(new ErrorHandler("Seller not found", 404));
            }

            // Update the 'suspend' field to true
            seller.suspend = true;

            // Save the updated seller
            await seller.save();

            res.status(200).json({
                success: true,
                message: "Seller suspended successfully",
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);
// remove suspend
router.put(
    "/remove-suspend-seller/:id",
    // isAuthenticated,
    // isAdmin("Admin", "SuperAdmin"),
    catchAsyncErrors(async (req, res, next) => {
        // console.log("-----------------------------------------");
        try {
            const { id } = req.params;
            // console.log(id);
            // Find the seller by ID
            const seller = await Shop.findById(id);

            // console.log(seller);
            if (!seller) {
                return next(new ErrorHandler("Seller not found", 404));
            }

            // Update the 'suspend' field to true
            seller.suspend = false;

            // Save the updated seller
            await seller.save();

            res.status(200).json({
                success: true,
                message: "Seller suspended successfully",
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// delete seller withdraw merthods --- only seller
router.delete(
    "/delete-withdraw-method/",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const seller = await Shop.findById(req.seller._id);

            if (!seller) {
                return next(
                    new ErrorHandler("Seller not found with this id", 400)
                );
            }

            seller.withdrawMethod = null;

            await seller.save();

            res.status(201).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

module.exports = router;
