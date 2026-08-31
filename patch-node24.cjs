const fs = require("fs");

function wrapError(err, path) {
  if (err && (err.code === "EISDIR" || err.code === "EINVAL")) {
    const e = new Error(`EINVAL: invalid argument, readlink '${path}'`);
    e.code = "EINVAL";
    e.errno = -4071;
    e.syscall = "readlink";
    return e;
  }
  return err;
}

const origReadlink = fs.readlink;
const origReadlinkSync = fs.readlinkSync;
const origPromisesReadlink = fs.promises ? fs.promises.readlink : null;

if (origReadlinkSync) {
  fs.readlinkSync = function (path, options) {
    try {
      return origReadlinkSync.call(this, path, options);
    } catch (err) {
      throw wrapError(err, path);
    }
  };
}

if (origReadlink) {
  fs.readlink = function (path, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = null;
    }
    origReadlink.call(this, path, options, (err, linkString) => {
      if (err) return callback(wrapError(err, path));
      return callback(null, linkString);
    });
  };
}

if (origPromisesReadlink) {
  fs.promises.readlink = async function (path, options) {
    try {
      return await origPromisesReadlink.call(this, path, options);
    } catch (err) {
      throw wrapError(err, path);
    }
  };
}
