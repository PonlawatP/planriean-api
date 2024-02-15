const jwt = require("jwt-simple");
const db = require("../../db");
async function getPlanUser(req, res){
    try {

        const jwt_dc = jwt.decode(req.headers['authorization'], process.env.SECRET_JWT)
        
          const user = jwt_dc.sub
          let result = await db.query('SELECT uid FROM user_detail WHERE username = $1', [user]);
          if(result.rows.length == 0) {
            res.status(400).send('User Not Found');
            return;
          }

          const uid = result.rows[0].uid

          result = await db.query('SELECT * FROM plan_detail WHERE user_uid = $1', [uid]);
          res.send({
            username: user,
            plans: result.rows
          });
        } catch (err) {
          console.error(err);
          res.status(500).send('Server Sad');
        }
}

module.exports = {
    getPlanUser
}