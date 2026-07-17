// Feature 1 — admin-only user account management.
// Every route requires an authenticated session with role = admin.
const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const adminUserController = require("../controllers/adminUserController");

const router = express.Router();

router.get("/admin/users", requireAdmin, adminUserController.listUsers);
router.post("/admin/users/:id/role", requireAdmin, adminUserController.updateUserRole);
router.post("/admin/users/:id/status", requireAdmin, adminUserController.updateUserStatus);
router.post("/admin/users/:id/reset-access", requireAdmin, adminUserController.adminResetAccess);
router.post("/admin/users/:id/delete", requireAdmin, adminUserController.deleteUser);

module.exports = router;
