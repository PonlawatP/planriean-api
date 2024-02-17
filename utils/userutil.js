const jwt = require("jwt-simple");
const db = require("../db");
async function getUser(username, show_passwd = false){
    try {
          let result = await db.query('SELECT * FROM user_detail WHERE username = $1', [username]);

          if(result.rows.length == 0) {
            return null;
          }

          const ress = show_passwd ? result.rows[0] : {...result.rows[0], password: undefined}
          return ress
        } catch (err) {
            return null;
        }
}
async function getUserFromToken(req, show_passwd = false){
    try {
        const jwt_dc = jwt.decode(req.headers['authorization'], process.env.SECRET_JWT)
        
          const user = jwt_dc.sub
          let result = await db.query('SELECT * FROM user_detail WHERE username = $1', [user]);
          
          if(result.rows.length == 0) {
            return null;
          }

          const ress = show_passwd ? result.rows[0] : {...result.rows[0], password: undefined}
          return ress
        } catch (err) {
            return null;
        }
}

module.exports = {
    getUser,
    getUserFromToken
}