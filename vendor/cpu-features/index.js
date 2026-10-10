// ssh2 calls require("cpu-features")() inside try/catch; throwing here selects its portable defaults.
module.exports = function cpuFeatures() {
  throw new Error("cpu-features is not available in this build");
};
