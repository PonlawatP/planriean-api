const db = require("../../db");
const jwt = require("jwt-simple");

async function authToken(req, res){
    const payload = {
        sub: req.body.username,
        iat: new Date().getTime()//มาจากคำว่า issued at time (สร้างเมื่อ)
    };
    res.send({token : jwt.encode(payload, process.env.SECRET_JWT)});
}

async function authGetUser(req, res){
    try {

      const jwt_dc = jwt.decode(req.headers['authorization'], process.env.SECRET_JWT)
      
        const user = jwt_dc.sub
        const result = await db.query('SELECT * FROM user_detail WHERE username = $1', [user]);

        if(result.rows.length > 0){
          let user_nopass = {...result.rows[0], password:undefined}

          const uni_res = await db.query('SELECT * FROM university_detail WHERE uni_id = $1', [user_nopass.uni_id]);
          const fac_res = await db.query('SELECT * FROM university_faculty WHERE uni_id = $1 AND fac_id = $2', [user_nopass.uni_id, user_nopass.fac_id]);
          const maj_res = await db.query('SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3', [user_nopass.uni_id, user_nopass.fac_id, user_nopass.major_id]);
          const courseset_res = await db.query('SELECT * FROM courseset_detail WHERE cr_id = $1', [user_nopass.cr_id]);

          const data = {
            user: {
              ...user_nopass,
              uni_id: undefined,
              fac_id: undefined,
              major_id: undefined,
              cr_id: undefined,
              study_status: {
                university: {...uni_res.rows[0]},
                faculty: {...fac_res.rows[0]},
                major: {...maj_res.rows[0]},
                courseset: {...courseset_res.rows[0]},
              }
            }
          }
          res.json(data);
        } else {
          res.status(404).send('No User Found');
        }
      } catch (err) {
        console.error(err);
        res.status(403).send('Invalid Input');
      }
}

module.exports = {
  authToken,
  authGetUser
}