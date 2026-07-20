const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/auth");
const categoryController = require("../controllers/categoryController");

router.get("/admin/categories", isAdmin, categoryController.listCategories);
router.get("/admin/categories/new", isAdmin, categoryController.showAddCategoryForm);
router.post("/admin/categories", isAdmin, categoryController.createCategory);
router.get("/admin/categories/:id/edit", isAdmin, categoryController.showEditCategoryForm);
router.post("/admin/categories/:id/edit", isAdmin, categoryController.updateCategory);
router.post("/admin/categories/:id/delete", isAdmin, categoryController.deleteCategory);

module.exports = router;
