const home = (req, res) => {
    const data = {
        service: 'planriean-subjects-service',
        version: 2,
        status: "running"
    }
    res.json(data);
}

module.exports = {
    home
}