const home = (req, res) => {
    const data = {
        service: 'planriean-subjects-service',
        version: 2,
        status: "running"
    }
    res.send(data);
}

module.exports = {
    home
}