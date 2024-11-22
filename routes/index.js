const version = require("../package.json").version;
const home = (req, res) => {
    const data = {
        service: 'planriean-subjects-service',
        version: version,
        status: "running"
    }
    res.json(data);
}

module.exports = {
    home
}