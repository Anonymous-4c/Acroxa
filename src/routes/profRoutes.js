const express = require("express");
const router = express.Router();
const { verifyAPIToken } = require("../middlewares/authMiddleware");
const { renderProfile } = require("../views/profile");
const { getUserProfile } = require("../controllers/profileController");

router.get("/profile", verifyAPIToken, async (req, res) => {
    try {
        const userData = await getUserProfile(req);
        // Render HTML using your existing function
        const html = renderProfile(
            userData.user,
            userData,
        );
        // Send HTML response
        res.status(200).send(html);
    } catch (err) {
        console.error("ProfileController error:", err);
        res.status(500).send(`<p class="error">Failed to load profile</p>`);
    }
});
module.exports = router;