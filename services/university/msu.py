# VN-Reg Web-Scraping Script
# PlutoPon
# เขียนไทยเพื่อให้ง่ายต่อการทำความเข้าใจ เพราะมันคือ Project จบ

import re
import json
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
import warnings
import requests
import psycopg2
import configparser
import time
from datetime import datetime, timedelta

from urllib.parse import urlparse, parse_qs
from psycopg2.extras import execute_values

# Set headers
headers = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.7',
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
}

# specify user/password/where the database is
config = configparser.ConfigParser()
config.read('pg_config.ini')
# Get config
sqluser = config['database'].get('sqluser')
sqlpass = config['database'].get('sqlpass')
dbname = config['database'].get('dbname')
schema_name = config['database'].get('schema_name')
host = config['database'].get('host')


query_schema = 'SET search_path to ' + schema_name + ';'

# connect to the database
con = psycopg2.connect(dbname=dbname, user=sqluser, password=sqlpass, host=host)

warnings.filterwarnings('ignore', category=MarkupResemblesLocatorWarning)

# Class นี้เขียนเพื่อจะใช้กับระบบทะเบียนของมหาวิทยาลัยมหาสารคาม หากต้องการแก้ไขพื่อใช้กับมหาวิทยาลัยอื่นๆ อาจต้องพิจารณาตามความเหมาะสมของโครงเว็บในมหาวิทยาลัยนั้นๆ ด้วย
class MSU:
    # getUniversityID
    # ดึง id ของมหาวิทยาลัย
    # params
        # - name
            # ชื่อย่อมหาลัย เช่น "MSU"
    def getUniversityID(name):
        cur = con.cursor()
        query = f'{query_schema} select uni_id from university_detail where uni_key = \'{name}\';'
        # print(query)
        cur.execute(query)
        university_id = cur.fetchone()[0]
        con.commit()
        return university_id

    # scrap_fac_data
    # ดงข้อมูลคณะเฉยๆ ยังไม่ได้ใช้
    # ประกอบด้วย
        # - รหัสคณะ
        # - ชื่อคณะ
    def scrap_fac_data():
        # set post data
        f_data = {
            'facultyid': 1,
        }

        # request web page with post method
        response = requests.post('https://reg.msu.ac.th/registrar/program_info.asp', headers=headers, data=f_data)

        # check status
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            return

        # BeautifulSoup
        resp = BeautifulSoup(response.content, 'html5lib')

        # select table by CSS selector
        soup = resp.select('body > div.contenttive > div > div.main > div > div > form > table > tbody > tr > td:nth-child(2) > font > select > option')
        res = []
        for row in soup:
            value = row['value']
            name = row.text.split(" : ")[1].strip()
            print(value, name)
            res.append(value)
        return res

    # scrap_courseset_list
    # ดึงข้อมูลรายการหลักสูตรของคณะมาเก็บไว้ก่อน
    # ประกอบด้วย : ทั้งหมดเก็บใน courseset_detail
        # - รหัสหลักสูตร
        # - ชื่อหลักสูตร
        # - อักษรย่อ
        # - หน่วยกิต
        # - ปีการศึกษา
        # - เกรดต่ำที่สุด
        # - ลิ้งค์ไปยังข้อมูลหลักสูตร
    # และแยกประเภทของ หลักสูตรนั้นๆ ด้วย โดยจะเก็บข้อมูลประเภทไว้ใน courseset_group
    # params
        # - facultyid = 12
            # รหัสประจำคณะ เช่น คณะวิทยาการสารสนเทศ = 12
    def scrap_courseset_list(facultyid = 12):
        # set post data
        f_data = {
            'facultyid': facultyid,
        }
        
        def run(lang = 'th'):
            res = []
            # request web page with post method
            # ส่งค่าจาก f_data ไปเพื่อรับค่าจาก web กลับมา
            response = requests.post('https://reg.msu.ac.th/registrar/program_info.asp', headers=headers, data=f_data)
            # check status
            if response.status_code != 200:
                print(f"Error: {response.status_code}")
                return

            # ตอนแรกใช้ bs แบบ html.parser เลยต้อง convert charset เพื่อให้ภาษาไทยไม่เป็นภาษาต่างดาว
            # convert from windows-874 charset to utf-8
            response.encoding = "windows-874"

            content_windows874 = response.content
            content_utf8 = content_windows874.decode("TIS-620").encode("utf-8")

            # BeautifulSoup
            resp = BeautifulSoup(content_utf8, 'html.parser')


            # select table by CSS selector
            # การทำงานคือ soup จะเข้าตามลำดับ element ลงไปเรื่อย ๆ จนถึงลำดับสุดท้ายที่เราเขียนไว้
            soup = resp.select_one('body > div.contenttive > div > div.main > div > div > table')

            # Find all rows in the table
            rows = soup.find_all('tr', class_='normalDetail')

            university_id = MSU.getUniversityID("MSU")
            current_header_id = 0

            cur = con.cursor()
            for row in rows:
                cell = row.find('td')
                c_a = cell.find('a')
                if c_a != None:
                    cells = row.findAll('td')
                    og_link = c_a['href']
                    cr_id = c_a.text.strip()
                    name = cells[1].text.strip()
                    cr_key = cells[2].text.strip()
                    credit = cells[3].text.strip()

                    if credit == "":
                        continue

                    year = cells[4].text.strip()
                    lowset_grade = cells[5].text.strip()
                    cr_group_id = current_header_id

                    if year == "":
                        continue

                    query = """
                            INSERT INTO courseset_detail (cr_group_id, uni_id, fac_id, cr_id, name_th, cr_key, credit, year, lowset_grade, og_link)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (cr_id, fac_id, uni_id)
                            DO UPDATE SET
                                name_th = %s,
                                cr_key = %s,
                                credit = %s,
                                og_link = %s,
                                year = %s,
                                lowset_grade = %s
                            ;"""
                    cur.execute(query, (cr_group_id, university_id, facultyid, cr_id, name, cr_key, credit, year, lowset_grade, og_link, name, cr_key, credit, og_link, year, lowset_grade))
                    con.commit()
                    res.append(cr_id)
                else:
                    edu_level = cell.text.split(":")[1].strip()

                    query = 'select cr_group_id from courseset_group where name_th = %s and uni_id = %s;'
                    cur.execute(query, (edu_level, university_id))
                    rows = cur.fetchone()
                    con.commit()
                    # print(edu_level)

                    if rows == None:
                        query = 'insert into courseset_group(name_th, uni_id) values (%s, %s) returning cr_group_id;'
                        print(edu_level)
                        cur.execute(query, (edu_level, university_id))
                        gid = cur.fetchone()[0]
                        current_header_id = gid
                        # result.append({'id': gid, 'name_en': '', 'name_th': edu_level.strip()})
                        con.commit()
                    else:
                        # result.append({'id': rows[0], 'name_en': rows[1], 'name_th': rows[2]})
                        current_header_id = rows[0]
            return res
            # print(result)


        return run('th')
        # run('en')

    # scrap_courseset_detail
    # ดึงข้อมูลแผนหลักสูตรมาเก็บไว้
    # ประกอบด้วย
        # - หัวข้อของกลุ่มรายวิชาแต่ละหลักสูตร (สามารถซ้อนกันได้) : เก็บใน courseset_detail
            # - หน่วยกิตรวมของกลุ่มรายวิชา : เก็บใน courseset_detail
            # - ข้อมูลรายวิชาในกลุ่มของรายวิชาของหลักสูตร : เก็บใน courseset_subject
    # params
        # - facultyid = 12
            # รหัสประจำคณะ เช่น คณะวิทยาการสารสนเทศ = 12
        # - courseset_id = 12
            # รหัสหลักสูตรของภาควิชา เช่น หลักสูตรวิทยาการคอมพิวเตอร์ ปี 63 = 1126302
    def scrap_courseset_detail(facultyid = 12, courseset_id = 1126302):
        # set post data
        f_data = {
            'facultyid': facultyid,
            'programid': courseset_id
        }
        
        def run(lang = 'th'):

            # request web page with post method
            response = requests.post('https://reg.msu.ac.th/registrar/program_info_1.asp', headers=headers, data=f_data)
            # check status
            if response.status_code != 200:
                print(f"Error: {response.status_code}")
                return
            
            cur = con.cursor()

            # BeautifulSoup
            resp = BeautifulSoup(response.content, 'html5lib')

            # select table by CSS selector
            soup = resp.select('body > div.contenttive > div > div.main > div > table')[1]
            # and extract only group of coursesets (msu = skip 2)
            tables = soup.select('table')[2:]

            # variable for courseset_header
            uni_id = MSU.getUniversityID("MSU")
            fac_id = facultyid
            cr_id = courseset_id
            cr_head_id = None
            for table in tables:
                cr_head_id_ref = None
                cr_id_ref = None
                uni_id_ref = None
                fac_id_ref = None

                if table.select_one('table > tbody > tr.detail') == None:
                    # if it not an header
                    t_sets = table.select('table > tbody > tr.header')
                    for subj in t_sets[1:]:
                        s_sets = subj.select('tr > td')
                        suj_id = s_sets[0].text.strip()
                        suj_name_en = re.sub(r"\s+", " ", s_sets[1].contents[0].text.strip())
                        suj_name_th = re.sub(r"\s+", " ", s_sets[1].contents[2].text.strip())
                        suj_credit = s_sets[2].text.strip()
                        suj_real_id = s_sets[0].select_one('a')['href'].split('courseid=')[1]
                        
                        # print('\t',cr_id, fac_id, uni_id, cr_head_id, suj_id, suj_name_en, suj_name_th, suj_credit, suj_real_id)
                        query = """
                                INSERT INTO courseset_subject (cr_id, fac_id, uni_id, cr_head_id, suj_id, suj_name_en, suj_name_th, suj_credit, suj_real_id)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                ON CONFLICT (suj_real_id, cr_id)
                                DO UPDATE SET
                                    suj_name_en = %s,
                                    suj_name_th = %s,
                                    suj_credit = %s
                                ;"""
                        cur.execute(query, (cr_id, fac_id, uni_id, cr_head_id, suj_id, suj_name_en, suj_name_th, suj_credit, suj_real_id, suj_name_en, suj_name_th, suj_credit))
                        con.commit()
                else:
                    # it's header (weird? nope)
                    t_sets = table.select('table > tbody > tr.detail > td')
                    name_res = re.sub(r"\s+", " ", t_sets[0].text.strip())

                    cr_head_id = name_res.split(" ")[0]
                    if cr_head_id.endswith('.'):
                        cr_head_id = cr_head_id[:-1]
                    cr_name_th = ' '.join(name_res.split(" ")[1:])
                    cr_min_credit_ref = t_sets[1].text.split(" : ")[1].strip()
                    if cr_min_credit_ref == "-":
                        cr_min_credit_ref = None

                    # set reference header (if it have)
                    def find_references():
                        references = []

                        parts = cr_head_id.split('.')
                        for ii in range(len(parts)):
                            if len(parts) > ii+1:
                                parent = parts[ii]
                                references.append(parent)

                        return '.'.join(references)
                    
                    ref_temp = find_references()
                    if ref_temp != '':
                        # it has referenced
                        cr_head_id_ref = ref_temp
                        cr_id_ref = cr_id
                        uni_id_ref = uni_id
                        fac_id_ref = fac_id

                    # print(f'head: {cr_head_id} | ref: {cr_head_id_ref}')

                    # print(cr_head_id, cr_name_th, cr_id_ref, fac_id_ref, uni_id_ref, cr_head_id_ref, cr_min_credit_ref)
                    query = """
                            INSERT INTO courseset_header (cr_id, fac_id, uni_id, cr_head_id, cr_name_en, cr_name_th, cr_id_ref, fac_id_ref, uni_id_ref, cr_head_id_ref, cr_min_credit_ref)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (cr_id, fac_id, uni_id, cr_head_id)
                            DO UPDATE SET
                                cr_name_th = %s,
                                cr_name_en = %s,
                                cr_min_credit_ref = %s
                            ;"""
                    cur.execute(query, (cr_id, fac_id, uni_id, cr_head_id, None, cr_name_th, cr_id_ref, fac_id_ref, uni_id_ref, cr_head_id_ref, cr_min_credit_ref, cr_name_th, None, cr_min_credit_ref))
                    con.commit()


        run('th')
        # run('en')

    # scrap_subject_prerequisite
    # ดึงข้อมูลแผนหลักสูตรมาเก็บไว้
    # ประกอบด้วย
        # - หัวข้��ของกล��่มรายวิชาแต่ละหลักสูตร (สามารถซ้อนกันได้) : เก็บใน courseset_detail
            # - หน่วยกิตรวมของกลุ่มรายวิชา : เก็บใน courseset_detail
            # - ข้อมูลรายวิชาในกลุ่มของรายวิชาของหลักสูตร : เก็บใน courseset_subject
    # params
        # - facultyid = 12
            # รหัสประจำคณะ เช่น คณะวิทยาการสารสนเทศ = 12
        # - courseset_id = 12
            # รหัสหลักสูตรของภาควิชา เช่น หลักสูตรวิทยาการคอมพิวเตอร์ ปี 63 = 1126302
    def scrap_subject_prerequisite():
        uni_id = MSU.getUniversityID("MSU")
        
        def run(lang = 'th', suj_real_code = '0'):
            try:
                # request web page with post method
                response = requests.post(f'https://reg.msu.ac.th/registrar/program_info_2.asp?courseid={suj_real_code}', headers=headers)
                # check status
                if response.status_code != 200:
                    print(f"Error: {response.status_code}")
                    return
                
                cur = con.cursor()

                # BeautifulSoup
                resp = BeautifulSoup(response.content, 'html5lib')

                # select table by CSS selector
                soup = resp.select('body > div.contenttive > div > div.main > div > table')[0]
                tables = soup.select('tr[valign="TOP"] > td')
                last_table = tables[-1] if tables else None
                
                if last_table:
                    content = last_table.get_text(separator='\n', strip=True)
                    lines = content.split('\n')
                    codes = []
                    for line in lines:
                        codes.extend(re.findall(r'\d{7}', line))
                    distinct_codes = ','.join(sorted(set(codes)))
                    return distinct_codes if distinct_codes else None
                else:
                    return None
            except Exception as e:
                print(f"\nError: {e}")
                attempts = 0
                while attempts < 3:
                    print(f"\rCooldown: {20 - attempts * 3} seconds remaining...", end="", flush=True)
                    time.sleep(20)
                    print("\rRetrying...                            ", end="", flush=True)
                    try:
                        return run(lang, suj_real_code)
                    except Exception:
                        attempts += 1
                print("\nFailed after 3 attempts. Stopping script.")
                sys.exit(1)

        def get_subjects_to_update():
            with psycopg2.connect(dbname=dbname, user=sqluser, password=sqlpass, host=host) as conn:
                with conn.cursor() as cur:
                    query = """
                    SELECT DISTINCT suj_real_id 
                    FROM courseset_subject 
                    WHERE suj_pre_req_updated is not TRUE 
                    AND suj_real_id is not null
                    """
                    cur.execute(query)
                    subjects = cur.fetchall()
            return [subject[0] for subject in subjects]

        subjects_to_update = get_subjects_to_update()
        
        if subjects_to_update:
            total_subjects = len(subjects_to_update)
            print(f"Found {total_subjects} subjects to update.")
            user_input = input("Press 'y' to continue the process: ")
            if user_input.lower() != 'y':
                print("Process aborted by user.")
                return

            update_data = []
            try:
                for index, subject_code in enumerate(subjects_to_update, 1):
                    overall_progress = (index / total_subjects) * 100
                    batch_progress = ((index - 1) % 500 + 1) / 500 * 100
                    
                    progress_message = f"\rUpdating subject: {subject_code} | Overall Progress: {overall_progress:.2f}% ({index}/{total_subjects}) | Batch Progress: {batch_progress:.2f}%"
                    print(f"{progress_message:<100}", end="", flush=True)
                    
                    prereq_codes = run('th', subject_code)
                    update_data.append((prereq_codes, True, subject_code))

                    if index % 50 == 0 or index == total_subjects:
                        with psycopg2.connect(dbname=dbname, user=sqluser, password=sqlpass, host=host) as conn:
                            with conn.cursor() as cur:
                                update_query = """
                                UPDATE courseset_subject
                                SET suj_pre_req = data.prereq_codes,
                                    suj_pre_req_updated = data.updated
                                FROM (VALUES %s) AS data(prereq_codes, updated, suj_real_id)
                                WHERE courseset_subject.suj_real_id = data.suj_real_id
                                """
                                execute_values(cur, update_query, update_data)
                                conn.commit()
                        update_data = []  # Clear the update_data list after bulk update

                    if index % 500 == 0:
                        print("\nReached 500 items. Starting 5-minute cooldown.")
                        cooldown_end = datetime.now() + timedelta(minutes=5)
                        while datetime.now() < cooldown_end:
                            remaining = cooldown_end - datetime.now()
                            cooldown_message = f"\rCooldown: {remaining.seconds // 60:02d}:{remaining.seconds % 60:02d} remaining"
                            print(f"{cooldown_message:<100}", end="", flush=True)
                            time.sleep(1)
                        print("\nCooldown finished. Resuming updates.")

                print("\nAll subjects updated successfully.")
            except KeyboardInterrupt:
                print("\nProcess interrupted by user. Performing final update...")
                if update_data:
                    with psycopg2.connect(dbname=dbname, user=sqluser, password=sqlpass, host=host) as conn:
                        with conn.cursor() as cur:
                            update_query = """
                            UPDATE courseset_subject
                            SET suj_pre_req = data.prereq_codes,
                                suj_pre_req_updated = data.updated
                            FROM (VALUES %s) AS data(prereq_codes, updated, suj_real_id)
                            WHERE courseset_subject.suj_real_id = data.suj_real_id
                            """
                            execute_values(cur, update_query, update_data)
                            conn.commit()
                print(f"Process stopped. {index} out of {total_subjects} subjects were updated.")
        else:
            print("No subjects found to update.")
            return
        # run('en')

    # scrap_courses_data
    # ดึงข้อมูลของรายวิชาที่ต้องการค้นหาในแต่ละเทอมปีการศึกษามาเก็บไว้
    # ประกอบด้วย : เก็บใน course_detail
        # - เลขประจำมหาวิทยาลัย
        # - ปีการศึกษา
        # - เทอม
        # - รหัสรายวิชา
        # - ชื่อรายวิชา
        # - ข้อมูลหมายเหตุ (ถ้ามี)
        # - หน่วยกิต
        # - วันและเวลาที่เรียน
        # - ชื่ออาจารย์
        # - กลุ่มเรียน
        # - วันที่สอบกลางภาค
        # - วันที่สอบปลายภาค
        # - รหัสรายวิชาตามจริง (ใช้เพื่อดึงข้อมูล)
        # - จำนวนที่นั่งที่เหลือ : เก็บใน course_seat
        # - จำนวนที่นั่งที่เปิดรับทั้งหมด : เก็บใน course_seat
    def scrap_courses_data(year = 2566, semester = 2, f_data: str = None, coursecode:str = "00*", init_coursedata = True, debug = False):
        if debug:
            print(f'scraping {coursecode}')
        # set post data
        if not f_data:
            f_data = {
                'facultyid': 'all',
                'maxrow': '1000',
                'Acadyear': year,
                'semester': semester,
                'coursecode': coursecode,
            }

        # request web page with post method
        response = requests.post('https://reg.msu.ac.th/registrar/class_info_1.asp', headers=headers, data=f_data)

        # check status
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            return

        # print(response.content)
        # BeautifulSoup
        resp = BeautifulSoup(response.content, 'html5lib')

        # select table by CSS selector
        soup = resp.select_one('body > div.contenttive > div:nth-child(1) > div.main > div > table')
        
        # Find all rows in the table, excluding the header and footer rows ([หน้าก่อน] [หน้าต่อไป])
        rows = soup.select('table > tbody > tr')[3:-1]
        # print(rows)


        uni_id = MSU.getUniversityID("MSU")
        # Iterate over each row and extract the required information
        # print(rows)
        bulk_sql_1 = []
        bulk_sql_2 = []
        for row in rows:
            cells = row.find_all('td')
            seat_available = int(cells[6].text.strip())

            # if seat_available == 0:
            #     continue

            code = cells[1].find('a').text.strip()

            # Parse the URL
            parsed_url = urlparse(cells[1].find('a')['href'])
            query_params = parse_qs(parsed_url.query)
            suj_real_code = query_params.get('courseid', [])[0]

            subject_data = cells[2].decode_contents().split("<br/>")
            name_en = cells[2].contents[0].strip()
            credit = cells[3].text.strip()
            time_temp = BeautifulSoup(cells[4].decode_contents().replace("<br/>",";"), 'html5lib').text.split(';')
            time_temp_res = []
            for t in time_temp:
                t_str = t.strip()
                if t_str != '':
                    time_temp_res.append(t_str)
            time = ';'.join(time_temp_res)
            sec = int(cells[5].text.strip())
            seat_remain = int(cells[7].text.strip())
            
            # print(code, subject_data, name, credit, time, sec, seat_remain, seat_available)

            # ======== complicated zone
            # fetch all of master name
            lecturer_raw = subject_data[0]
            try:
                lecturer_raw = subject_data[1]
            except:
                pass
            # Extract the <font> elements within the outer <font> element
            font_elements = re.findall(r'<font[^>]*>.*?</font>', lecturer_raw)
            # Extract the text content of the <li> elements
            li_text = [li for font in font_elements for li in re.findall(r'<li>.*?</li>', font)]
            # Remove the <li> tags from the extracted text
            li_text = [re.findall(r'<li>(.*?)<\/li>', nameLecture)[0].replace('<li>', ';') for nameLecture in li_text]
            # Join the extracted text with a delimiter
            lecturer = ' / '.join(li_text)

            # fetch note message if it has
            # Find the first <font> element
            first_font = re.search(r'<font[^>]*>(.*?)</font>', lecturer_raw)

            # Remove any nested <font> elements within the first <font> element
            note = re.sub(r'<font[^>]*>.*?</font>', '', first_font.group(1))
            # Find the content before the <font> tag
            match = re.search(r'(.*?)<font', note)

            # Extract the content
            if match:
                note = re.sub(r'[()&lt;&gt;]', '', match.group(1)).strip()

            else:
                note = None

            # ======== exit complicated zone

            mid = None
            final = None

            try:
                split_data = time.split("สอบปลายภาค")
                mid = split_data[0].strip().split("สอบกลางภาค")[1].replace(";","").strip()
            except:
                pass

            try:
                split_data = time.split("สอบปลายภาค")
                final = split_data[1].replace(";","").strip()
            except:
                pass


            try:
                split_data = time.split("สอบกลางภาค")
                time = split_data[0].strip()[0:-1]
            finally:
                try:
                    split_data = time.split("สอบปลายภาค")
                    time = split_data[0].strip()[0:-1]
                except:
                    pass

            # print(uni_id, year, semester, code, name_en, note, credit, time, sec, lecturer, mid, final, suj_real_code)
            bulk_sql_1.append((uni_id, year, semester, code, name_en, note, credit, time, sec, lecturer, mid, final, suj_real_code))
            bulk_sql_2.append((seat_remain, seat_available, uni_id, year, semester, code, sec, seat_remain, seat_available))

        if len(bulk_sql_2) > 0:
            cur = con.cursor()
            if init_coursedata == True:
                query = """
                    INSERT INTO course_detail (uni_id, year, semester, code, name_en, note, credit, time, sec, lecturer, exam_mid, exam_final, suj_real_code)
                    VALUES %s
                    ON CONFLICT (uni_id, year, semester, sec, code, suj_real_code)
                    DO UPDATE SET
                        note = EXCLUDED.note,
                        time = EXCLUDED.time,
                        lecturer = EXCLUDED.lecturer,
                        exam_mid = EXCLUDED.exam_mid,
                        exam_final = EXCLUDED.exam_final
                    ;
                """
                unique_data = list({(d[0], d[1], d[2], d[8], d[3], d[12]): d for d in bulk_sql_1}.values())
                print(unique_data)
                execute_values(cur, query, unique_data)

            query = """
                        INSERT INTO course_seat (seat_remain, seat_available, cr_id)
                        SELECT
                            data.seat_remain, data.seat_available, cd.cr_id
                        FROM
                            course_detail cd,
                            (VALUES %s) AS data (seat_remain, seat_available, uni_id, year, semester, code, sec, update_seat_remain, update_seat_available)
                        WHERE
                            cd.uni_id = data.uni_id AND
                            cd.year = data.year AND
                            cd.semester = data.semester AND
                            cd.code = data.code AND
                            cd.sec = data.sec
                        ON CONFLICT (cr_id)
                        DO UPDATE SET
                            seat_remain = EXCLUDED.seat_remain,
                            seat_available = EXCLUDED.seat_available
                        ;
                    ;"""
            # cur.execute(query, (seat_remain, seat_available, uni_id, year, semester, code, sec, seat_remain, seat_available))
            # Remove duplicates from the data
            unique_data = list({(d[2], d[3], d[4], d[5], d[6]): d for d in bulk_sql_2}.values())
            execute_values(cur, query, unique_data)
            con.commit()

        if debug:
            print(f'{coursecode} complete!')

        # check next page
        # try:
        #     if soup.find_all('tr', class_='normalDetail')[-1].select_one('td:nth-child(2) > a')['href']:
        #         # set next page data
        #         next_f_data = soup.find_all('tr', class_='normalDetail')[-1].select_one('td:nth-child(2) > a')['href'].split('class_info_1.asp?')[1]
        #         print(next_f_data)
        #         return MSU.scrap_ge_data(next_f_data)
        # except Exception:
        #     pass

    # ด้านล่างยังไม่ได้ต่อ ไม่ต้องดูก็ได้เพราะคิดว่าไม่น่าใช้แล้วแหละ
    def split_ge_data(self):
        # Create a dictionary for each course and append it to the data list
        GE = {}
        
        for course in self.dataALL:
            if course['type'] not in GE:
                GE[course['type']] = []
            GE[course['type']].append(course)
            
        # Save the JSON data to the file
        for key in GE:
            with open(f"Group/MSU/{key}.json", "w", encoding="utf-8") as file:
                json.dump(GE[key], file, indent=4, ensure_ascii=False)
    # final process
    def get_all_ge_subjects(self):
        self.ge_data_all = []
        # scrap data
        self.scrap_ge_data()

        # sort list by remain most
        self.ge_data_all.sort(key=lambda x: x['remain'], reverse=True)

        # split data
        self.split_ge_data()

        # Save the JSON data to the file
        with open(f"Group/MSU/dataALL.json", "w", encoding="utf-8") as file:
            json.dump(self.ge_data_all, file, indent=4, ensure_ascii=False)

