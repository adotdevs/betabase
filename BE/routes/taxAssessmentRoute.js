const express = require("express");
const { submitTaxAssessment } = require("../controllers/taxAssessmentController");

const router = express.Router();

router.route("/taxAssessment/submit").post(submitTaxAssessment);

module.exports = router;
