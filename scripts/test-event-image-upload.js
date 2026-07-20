const assert = require("assert");
const { buildUploadFilename } = require("../lib/eventImageUpload");

const filename = buildUploadFilename({ originalname: "My Event Photo.JPG" });
assert.ok(filename.includes("my-event-photo"), "filename should be sanitised");
assert.ok(filename.endsWith(".jpg"), "filename should preserve the jpg extension");
assert.ok(filename.includes("-"), "filename should include a timestamp suffix");

console.log("event image upload helper test passed");
