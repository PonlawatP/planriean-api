const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");

async function getCoursesetDetail(req, res){
  try {
      const user = await getUserFromToken(req);
      const {id} = req.params
      if(user != null){
        const crs = await db.query('SELECT * FROM courseset_detail WHERE cr_id = $1;', [id]);
        if(crs.rows.length > 0){
          const crsr = crs.rows[0];
          const unv = await db.query('SELECT * FROM university_detail WHERE uni_id = $1;', [crsr.uni_id]);
          const fac = await db.query('SELECT * FROM university_faculty WHERE uni_id = $1 AND fac_id = $2;', [crsr.uni_id, crsr.fac_id]);
          const major = await db.query('SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3;', [crsr.uni_id, crsr.fac_id, crsr.major_key_ref]);
          const courseset_group = await db.query('SELECT name_en, name_th FROM courseset_group WHERE uni_id = $1 AND cr_group_id = $2;', [crsr.uni_id, crsr.cr_group_id]);
          
          const result = {
            data: {
              ...crsr,
              corseset_group: courseset_group.rows[0],
              cr_group_id: undefined,
              uni_id: undefined,
              fac_id: undefined,
              major_key_ref: undefined,
              university: unv.rows[0],
              faculty: fac.rows[0],
              major: crsr.major_key_ref == null ? null : major.rows[0]
            }
          }
          res.json(result);
        } else {
          throw err
        }
      } else {
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(404).send('Courseset Not Found');
    }
}
async function getCoursesetSubject(req, res){
  try {
      const user = await getUserFromToken(req);
      const {id} = req.params
      if(user != null){
        const crs = await db.query('SELECT * FROM courseset_detail WHERE cr_id = $1;', [id]);
        if(crs.rows.length > 0){
          const crsr = crs.rows[0];
          const courseset_header = await db.query('SELECT * FROM courseset_header WHERE uni_id = $1 AND fac_id = $2 AND cr_id = $3;', [crsr.uni_id, crsr.fac_id, id]);

          function compareCrHeadId(a, b) {
            return a.cr_head_id.localeCompare(b.cr_head_id);
          }

          const cr_hdd = courseset_header.rows.map(r => { return {
            ...r, 
            cr_id: undefined, 
            fac_id: undefined, 
            uni_id: undefined, 
            cr_id_ref: undefined, 
            fac_id_ref: undefined, 
            uni_id_ref: undefined, 
            children: [],
            subjects: []
            // cr_head_id_ref: undefined
          } })
          let sortedObjects = cr_hdd.sort(compareCrHeadId);

          // TODO: add courseset subjects here
          const courseset_subject = await db.query('SELECT * FROM courseset_subject WHERE uni_id = $1 AND fac_id = $2 AND cr_id = $3;', [crsr.uni_id, crsr.fac_id, id]);
          
          for (const head of sortedObjects) {
            for (const subj of courseset_subject.rows) {
              if(subj.cr_head_id == head.cr_head_id){
                head.subjects.push({...subj, cr_id:undefined, fac_id: undefined, uni_id: undefined})
              }
            }
          }

          let header_noparent = sortedObjects.filter(f=>f.cr_head_id_ref == null)

          function sumHeaderDetailInside(objects, parent) {
              for (const object of objects) {
                if (object.cr_head_id_ref === parent.cr_head_id) {
                  parent.children.push(object);
                  sumHeaderDetailInside(objects, object);
                }
              }
          }
          function sumHeaderDetail(objects, parents) {
            for (const parent of parents) {
              for (const object of objects) {
                if (object.cr_head_id_ref === parent.cr_head_id) {
                  parent.children.push(object);
                  sumHeaderDetailInside(objects, object);
                }
              }
            }
          }
          sumHeaderDetail(sortedObjects, header_noparent)

          const result = {
            data: header_noparent
          }
          res.json(result);
        } else {
          throw err
        }
      } else {
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(404).send('Courseset Not Found');
    }
}


module.exports = {
  getCoursesetDetail,
  getCoursesetSubject
}