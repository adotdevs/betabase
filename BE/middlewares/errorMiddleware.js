// middlewares/errorMiddleware.js
const ErrorHandler = require("../utils/errorHandler");
const ErrorLog = require("../models/errorLogs"); // 👈 ADD THIS

const errorMiddleware = async (err, req, res, next) => {
  // OPTIMIZED: Removed debug log that was causing performance issues during bulk operations
  // Only log user info in development mode or for critical errors
  if (process.env.NODE_ENV === 'development' && err.statusCode >= 500) {
    console.log('Error user context:', req.user?._id || 'No user');
  }
   
  let statusCode = err.statusCode ? err.statusCode : 500;
  err.message = err.message ? err.message : "Internal sever error";

  // ✅ CastError (Mongoose invalid ObjectId)
 
  // ✅ CastError (Mongoose invalid ObjectId)
  if (err.name === "CastError") {
    const message = `Resource not found. Invalid ${err.path}`;
    err = new ErrorHandler(message, 400);
    statusCode = 400;
  }

  // ✅ Store in DB (only if enabled)
  if (process.env.ENABLE_ERROR_LOGGING !== 'false') {
    try {
      await ErrorLog.create({
        userId:req.user?._id,
        userName:req.user?.firstName,
        UserEmail:req.user?.email,
        route: req.originalUrl,
        method: req.method,
        message: err.message,
        stack: err.stack,
        body: req.body,
        params: req.params,
        query: req.query
      });
    } catch (dbError) {
      console.error("❌ Failed to log error to DB:", dbError);
    }
  }


  // ✅ Send response to client
  res.status(statusCode).json({
    success: false,
    msg: err.message,
    message: err.message,
    statusCode
  });

  console.log("statusCode: ", err.stack);
};

module.exports = { errorMiddleware };
