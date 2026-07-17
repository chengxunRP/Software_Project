const categoryModel = require("../models/categoryModel");
const { takeFlash } = require("./registrationController");

function flash(req, type, text) {
  if (req.session) {
    req.session.flash = { type: type, text: text };
  }
}

function buildBaseViewOptions(req) {
  return {
    layout: "app",
    role: "admin",
    activeNav: "categories",
    pageTitle: "Event Categories · Admin",
    currentUser: req.session.user,
    messages: takeFlash(req)
  };
}

function formatCategoryForForm(category) {
  return {
    category_id: category.category_id,
    name: category.name || "",
    description: category.description || ""
  };
}

async function listCategories(req, res) {
  try {
    const categories = await categoryModel.getAllWithEventCounts();
    res.render("categories/index", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Admin",
      pageHeading: "Event Category Management",
      pageLead: "Create, edit and manage categories used by organisers when creating events.",
      pageActions: '<a href="/admin/categories/new" class="btn-cc btn-cc-primary btn-cc-sm">+ Add Category</a>',
      categories: categories
    }));
  } catch (err) {
    console.error("Show categories failed:", err.message);
    res.status(500).render("error", Object.assign(buildBaseViewOptions(req), {
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load categories. Please try again shortly."
    }));
  }
}

async function showAddCategoryForm(req, res) {
  res.render("categories/add", Object.assign(buildBaseViewOptions(req), {
    pageEyebrow: "Admin",
    pageHeading: "Add Category",
    pageLead: "Create a new event category used by organisers when setting up events.",
    pageActions: '<a href="/admin/categories" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
    category: formatCategoryForForm({}),
    messages: []
  }));
}

async function createCategory(req, res) {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const errors = [];

  if (!name) {
    errors.push("Category name is required.");
  }
  if (name.length > 100) {
    errors.push("Category name must be 100 characters or fewer.");
  }

  try {
    const categories = await categoryModel.getAllWithEventCounts();

    if (errors.length === 0) {
      const exists = await categoryModel.existsWithName(name);
      if (exists) {
        errors.push("A category with that name already exists.");
      }
    }

    if (errors.length) {
      return res.render("categories/add", Object.assign(buildBaseViewOptions(req), {
        pageEyebrow: "Admin",
        pageHeading: "Add Category",
        pageLead: "Create a new event category used by organisers when setting up events.",
        pageActions: '<a href="/admin/categories" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
        category: formatCategoryForForm({ name, description }),
        categories: categories,
        messages: errors.map((text) => ({ type: "error", text: text }))
      }));
    }

    await categoryModel.createCategory({ name, description });
    flash(req, "success", "Category created successfully.");
    res.redirect("/admin/categories");
  } catch (err) {
    console.error("Create category failed:", err.message);
    res.render("categories/add", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Admin",
      pageHeading: "Add Category",
      pageLead: "Create a new event category used by organisers when setting up events.",
      pageActions: '<a href="/admin/categories" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      category: formatCategoryForForm({ name, description }),
      messages: [{ type: "error", text: "Could not save the category. Please try again." }]
    }));
  }
}

async function showEditCategoryForm(req, res) {
  try {
    const category = await categoryModel.getById(req.params.id);
    if (!category) {
      return res.status(404).render("error", Object.assign(buildBaseViewOptions(req), {
        pageTitle: "Category not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Category not found",
        errorMessage: "The category does not exist or was removed."
      }));
    }

    res.render("categories/edit", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Admin",
      pageHeading: "Edit Category",
      pageLead: "Update an existing event category used by organisers.",
      pageActions: '<a href="/admin/categories" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      category: formatCategoryForForm(category),
      messages: []
    }));
  } catch (err) {
    console.error("Show edit category failed:", err.message);
    res.status(500).render("error", Object.assign(buildBaseViewOptions(req), {
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the category. Please try again shortly."
    }));
  }
}

async function updateCategory(req, res) {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const errors = [];

  if (!name) {
    errors.push("Category name is required.");
  }
  if (name.length > 100) {
    errors.push("Category name must be 100 characters or fewer.");
  }

  try {
    const category = await categoryModel.getById(req.params.id);
    if (!category) {
      return res.status(404).render("error", Object.assign(buildBaseViewOptions(req), {
        pageTitle: "Category not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Category not found",
        errorMessage: "The category does not exist or was removed."
      }));
    }

    if (errors.length === 0) {
      const exists = await categoryModel.existsWithName(name, req.params.id);
      if (exists) {
        errors.push("A category with that name already exists.");
      }
    }

    if (errors.length) {
      return res.render("categories/edit", Object.assign(buildBaseViewOptions(req), {
        pageEyebrow: "Admin",
        pageHeading: "Edit Category",
        pageLead: "Update an existing event category used by organisers.",
        pageActions: '<a href="/admin/categories" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
        category: formatCategoryForForm({ category_id: req.params.id, name, description }),
        messages: errors.map((text) => ({ type: "error", text: text }))
      }));
    }

    await categoryModel.updateCategory(req.params.id, { name, description });
    flash(req, "success", "Category updated successfully.");
    res.redirect("/admin/categories");
  } catch (err) {
    console.error("Update category failed:", err.message);
    res.render("categories/edit", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Admin",
      pageHeading: "Edit Category",
      pageLead: "Update an existing event category used by organisers.",
      pageActions: '<a href="/admin/categories" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      category: formatCategoryForForm({ category_id: req.params.id, name, description }),
      messages: [{ type: "error", text: "Could not save the category. Please try again." }]
    }));
  }
}

async function deleteCategory(req, res) {
  try {
    const category = await categoryModel.getById(req.params.id);
    if (!category) {
      flash(req, "error", "Category not found.");
      return res.redirect("/admin/categories");
    }

    const assignedCount = await categoryModel.getAssignedEventCount(req.params.id);
    if (assignedCount > 0) {
      flash(req, "error", "This category cannot be deleted while it is assigned to an event.");
      return res.redirect("/admin/categories");
    }

    await categoryModel.deleteCategory(req.params.id);
    flash(req, "success", "Category deleted successfully.");
    res.redirect("/admin/categories");
  } catch (err) {
    console.error("Delete category failed:", err.message);
    flash(req, "error", "We could not delete the category. Please try again.");
    res.redirect("/admin/categories");
  }
}

module.exports = {
  listCategories,
  showAddCategoryForm,
  createCategory,
  showEditCategoryForm,
  updateCategory,
  deleteCategory
};
