import re
import json
from bs4 import BeautifulSoup
import requests
import threading
import psycopg2
import configparser

# Load config
config = configparser.ConfigParser()
config.read('webscraping.ini')
# Get config
year = config['config'].get('year')
semester = config['config'].get('semester')

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


class MSU:
    # init data
    ge_data_all = []

    # # init
    def getUniversityID(name):
        cur = con.cursor()
        query = f'{query_schema} select uni_id from university_detail where uni_key = \'{name}\';'
        # print(query)
        cur.execute(query)
        university_id = cur.fetchone()[0]
        con.commit()
        return university_id

    # Information process data
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

        # convert from windows-874 charset to utf-8
        response.encoding = "windows-874"

        content_windows874 = response.content
        content_utf8 = content_windows874.decode("TIS-620").encode("utf-8")

        # BeautifulSoup
        resp = BeautifulSoup(content_utf8, 'html.parser')


        # select table by CSS selector
        soup = resp.select_one('body > div.contenttive > div > div.main > div > div > form > table > tr > td > font > select > option')


        html_options = re.sub(r'</option>', r'</option>\n', soup.decode_contents())
        # print(html_options)

        soup = BeautifulSoup(f'<option value="1">{html_options}', 'html.parser')
        print(soup)

        options_list = []
        for option in soup.find_all('option'):
            value = option['value']
            name_th = option.text.split(' : ')[1]
            print(value)
            options_list.append({'name_th': name_th, 'value': int(value)})

        print(options_list)
        # Remove numeric part from the end of each 'name_th' value
        for entry in options_list:
            entry['name_th'] = re.sub(r'\d+$', '', entry['name_th'])

        # Print the modified data
        print(options_list)
        #     cells = row.find_all('td')
        #     code = cells[1].find('a').text.strip()
        #     subject_data = cells[2].decode_contents().split("<br/>")
        #     # TODO: มี font หลุดเข้ามาบางอัน
        #     name = subject_data[0].split("<font")[0]
        #     credit = cells[3].text.strip()
        #     time = cells[4].text.strip()
        #     sec = int(cells[5].text.strip())
        #     remain = int(cells[8].text.strip())
        #     receive = int(cells[6].text.strip())

        #     lecturer_raw = subject_data[0]
        #     try:
        #         lecturer_raw = subject_data[1]
        #     except:
        #         pass
        #     # Extract the <font> elements within the outer <font> element
        #     font_elements = re.findall(r'<font[^>]*>.*?</font>', lecturer_raw)
        #     # Extract the text content of the <li> elements
        #     li_text = [li for font in font_elements for li in re.findall(r'<li>.*?</li>', font)]
        #     # Remove the <li> tags from the extracted text
        #     li_text = [re.findall(r'<li>(.*?)<\/li>', nameLecture)[0].replace('<li>', ' / ') for nameLecture in li_text]
        #     # Join the extracted text with a delimiter
        #     lecturer = ' / '.join(li_text)

        #     # Find the first <font> element
        #     first_font = re.search(r'<font[^>]*>(.*?)</font>', lecturer_raw)

        #     # Remove any nested <font> elements within the first <font> element
        #     content = re.sub(r'<font[^>]*>.*?</font>', '', first_font.group(1))
        #     # Find the content before the <font> tag
        #     match = re.search(r'(.*?)<font', content)

        #     # Extract the content
        #     if match:
        #         content = match.group(1)
        #     else:
        #         content = ""

        #     mid = None
        #     final = None

        #     try:
        #         split_data = time.split("สอบปลายภาค")
        #         mid = split_data[0].strip().split("สอบกลางภาค")[1].strip()
        #     except:
        #         pass

        #     try:
        #         split_data = time.split("สอบปลายภาค")
        #         final = split_data[1].strip()
        #     except:
        #         pass


        #     try:
        #         split_data = time.split("สอบกลางภาค")
        #         time = split_data[0].strip()
        #     finally:
        #         try:
        #             split_data = time.split("สอบปลายภาค")
        #             time = split_data[0].strip()
        #         except:
        #             pass

        #     # Define the regular expression pattern
        #     pattern = r'(\d+)([A-Za-z])'
        #     # Find all matches in the string
        #     matches = re.findall(pattern, time)
        #     # Insert "&" between the number and alphabet character
        #     time = re.sub(pattern, r'\1 & \2', time)

        #     # set type
        #     type = "GE-"+code[3:4]

        #     # Create a dictionary for each course and append it to the data list
        #     course = {
        #         'type': type,
        #         'code': code,
        #         'name': name,
        #         'note': content,
        #         'credit': credit,
        #         'time': time,
        #         'sec': sec,
        #         'remain':remain,
        #         'receive': receive,
        #         'mid': mid,
        #         'final': final,
        #         'lecturer': lecturer
        #     }
        #     self.dataALL.append(course)
    def scrap_courseset_list(facultyid = 12):
        # set post data
        f_data = {
            'facultyid': facultyid,
        }
        
        def run(lang = 'th'):
            # request web page with post method
            response = requests.post('https://reg.msu.ac.th/registrar/program_info.asp', headers=headers, data=f_data)
            # check status
            if response.status_code != 200:
                print(f"Error: {response.status_code}")
                return

            # convert from windows-874 charset to utf-8
            response.encoding = "windows-874"

            content_windows874 = response.content
            content_utf8 = content_windows874.decode("TIS-620").encode("utf-8")

            # BeautifulSoup
            resp = BeautifulSoup(content_utf8, 'html.parser')


            # select table by CSS selector
            soup = resp.select_one('body > div.contenttive > div > div.main > div > div > table')

            # print(soup)
            # Find all rows in the table
            rows = soup.find_all('tr', class_='normalDetail')

            # print(rows)

            # Print the modified data
            # print(rows)

            cur = con.cursor()
            
            university_id = MSU.getUniversityID("MSU")
            current_header_id = 0

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
                        credit = 0
                    year = cells[4].text.strip()
                    lowset_grade = cells[5].text.strip()
                    cr_group_id = current_header_id
                    query = f"""
                            INSERT INTO courseset_detail (cr_group_id, uni_id, fac_id, cr_id, name_th, cr_key, credit, year, lowset_grade, og_link)
                            VALUES ({cr_group_id}, {university_id}, {facultyid}, {cr_id}, '{name}', '{cr_key}', {credit}, {year}, {lowset_grade}, \'{og_link}\')
                            ON CONFLICT (cr_id, fac_id, uni_id)
                            DO UPDATE SET
                                name_th = '{name}',
                                cr_key = '{cr_key}',
                                credit = {credit},
                                og_link = \'{og_link}\',
                                year = {year},
                                lowset_grade = {lowset_grade}
                            ;"""
                    cur.execute(query)
                    con.commit()
                else:
                    edu_level = cell.text.split(":")[1].strip()

                    query = f'{query_schema} select cr_group_id from courseset_group where name_{lang} = \'{edu_level}\';'
                    cur.execute(query)
                    rows = cur.fetchone()
                    con.commit()
                    # print(edu_level)

                    if rows == None:
                        query = f'{query_schema} insert into courseset_group(name_{lang}) values (\'{edu_level.strip()}\') returning cr_group_id;'
                        cur.execute(query)
                        gid = cur.fetchone()[0]
                        current_header_id = gid
                        # result.append({'id': gid, 'name_en': '', 'name_th': edu_level.strip()})
                        con.commit()
                    else:
                        # result.append({'id': rows[0], 'name_en': rows[1], 'name_th': rows[2]})
                        current_header_id = rows[0]

            # print(result)


        run('th')
        # run('en')
        #     code = cells[1].find('a').text.strip()
        #     subject_data = cells[2].decode_contents().split("<br/>")
        #     # TODO: มี font หลุดเข้ามาบางอัน
        #     name = subject_data[0].split("<font")[0]
        #     credit = cells[3].text.strip()
        #     time = cells[4].text.strip()
        #     sec = int(cells[5].text.strip())
        #     remain = int(cells[8].text.strip())
        #     receive = int(cells[6].text.strip())

        #     lecturer_raw = subject_data[0]
        #     try:
        #         lecturer_raw = subject_data[1]
        #     except:
        #         pass
        #     # Extract the <font> elements within the outer <font> element
        #     font_elements = re.findall(r'<font[^>]*>.*?</font>', lecturer_raw)
        #     # Extract the text content of the <li> elements
        #     li_text = [li for font in font_elements for li in re.findall(r'<li>.*?</li>', font)]
        #     # Remove the <li> tags from the extracted text
        #     li_text = [re.findall(r'<li>(.*?)<\/li>', nameLecture)[0].replace('<li>', ' / ') for nameLecture in li_text]
        #     # Join the extracted text with a delimiter
        #     lecturer = ' / '.join(li_text)

        #     # Find the first <font> element
        #     first_font = re.search(r'<font[^>]*>(.*?)</font>', lecturer_raw)

        #     # Remove any nested <font> elements within the first <font> element
        #     content = re.sub(r'<font[^>]*>.*?</font>', '', first_font.group(1))
        #     # Find the content before the <font> tag
        #     match = re.search(r'(.*?)<font', content)

        #     # Extract the content
        #     if match:
        #         content = match.group(1)
        #     else:
        #         content = ""

        #     mid = None
        #     final = None

        #     try:
        #         split_data = time.split("สอบปลายภาค")
        #         mid = split_data[0].strip().split("สอบกลางภาค")[1].strip()
        #     except:
        #         pass

        #     try:
        #         split_data = time.split("สอบปลายภาค")
        #         final = split_data[1].strip()
        #     except:
        #         pass


        #     try:
        #         split_data = time.split("สอบกลางภาค")
        #         time = split_data[0].strip()
        #     finally:
        #         try:
        #             split_data = time.split("สอบปลายภาค")
        #             time = split_data[0].strip()
        #         except:
        #             pass

        #     # Define the regular expression pattern
        #     pattern = r'(\d+)([A-Za-z])'
        #     # Find all matches in the string
        #     matches = re.findall(pattern, time)
        #     # Insert "&" between the number and alphabet character
        #     time = re.sub(pattern, r'\1 & \2', time)

        #     # set type
        #     type = "GE-"+code[3:4]

        #     # Create a dictionary for each course and append it to the data list
        #     course = {
        #         'type': type,
        #         'code': code,
        #         'name': name,
        #         'note': content,
        #         'credit': credit,
        #         'time': time,
        #         'sec': sec,
        #         'remain':remain,
        #         'receive': receive,
        #         'mid': mid,
        #         'final': final,
        #         'lecturer': lecturer
        #     }
        #     self.dataALL.append(course)
    def scrap_courseset_detail(facultyid = 12, courseset_id = 1126502):
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
            cr_head_id = 'NULL'
            for table in tables:
                cr_head_id_ref = 'NULL'
                cr_id_ref = 'NULL'
                uni_id_ref = 'NULL'
                fac_id_ref = 'NULL'

                if table.select_one('table > tbody > tr.detail') == None:
                    # if it not an header
                    t_sets = table.select('table > tbody > tr.header')
                    for subj in t_sets[1:]:
                        s_sets = subj.select('tr > td')
                        suj_id = s_sets[0].text.strip()
                        suj_name_en = re.sub(r"\s+", " ", s_sets[1].contents[0].text.strip())
                        suj_name_th = re.sub(r"\s+", " ", s_sets[1].contents[2].text.strip())
                        suj_credit = s_sets[2].text.strip()
                        
                        # print('\t',suj_id, suj_name_en, suj_name_th, suj_credit)
                else:
                    # it's header (weird? nope)
                    t_sets = table.select('table > tbody > tr.detail > td')
                    name_res = re.sub(r"\s+", " ", t_sets[0].text.strip())

                    cr_head_id = name_res.split(" ")[0]
                    cr_name_th = name_res.split(" ")[1]
                    cr_min_credit_ref = t_sets[1].text.split(" : ")[1].strip()
                    if cr_min_credit_ref == "-":
                        cr_min_credit_ref = 'NULL'

                    # set reference header (if it have)
                    def find_references():
                        references = []
                        parts = cr_head_id.split('.')
                        for ii in range(len(parts)):
                            if len(parts) > ii+1:
                                parent = parts[ii]  # The immediate parent value
                                # if parent not in references:
                                references.append(parent)
                                # references[parent].append(cr_head_id)

                        return '.'.join(references)
                    
                    ref_temp = find_references()
                    if ref_temp != '':
                        # it has referenced
                        cr_head_id_ref = ref_temp
                        cr_id_ref = cr_id
                        uni_id_ref = uni_id
                        fac_id_ref = fac_id

                    # print(cr_head_id, )
                    print(cr_head_id, cr_name_th, cr_id_ref, fac_id_ref, uni_id_ref, cr_head_id_ref, cr_min_credit_ref)
                    query = f"""
                            INSERT INTO courseset_header (cr_id, fac_id, uni_id, cr_head_id, cr_name_en, cr_name_th, cr_id_ref, fac_id_ref, uni_id_ref, cr_head_id_ref, cr_min_credit_ref)
                            VALUES ({cr_id}, {fac_id}, {uni_id}, \'{cr_head_id}\', NULL, \'{cr_name_th}\', {cr_id_ref}, {fac_id_ref}, {uni_id_ref}, \'{cr_head_id_ref}\', {cr_min_credit_ref})
                            ON CONFLICT (cr_id, fac_id, uni_id, cr_head_id)
                            DO UPDATE SET
                                cr_name_th = \'{cr_name_th}\',
                                cr_name_en = NULL,
                                cr_min_credit_ref = {cr_min_credit_ref}
                            ;"""
                    cur.execute(query)
                    con.commit()


        run('th')
        # run('en')
        #     code = cells[1].find('a').text.strip()
        #     subject_data = cells[2].decode_contents().split("<br/>")
        #     # TODO: มี font หลุดเข้ามาบางอัน
        #     name = subject_data[0].split("<font")[0]
        #     credit = cells[3].text.strip()
        #     time = cells[4].text.strip()
        #     sec = int(cells[5].text.strip())
        #     remain = int(cells[8].text.strip())
        #     receive = int(cells[6].text.strip())

        #     lecturer_raw = subject_data[0]
        #     try:
        #         lecturer_raw = subject_data[1]
        #     except:
        #         pass
        #     # Extract the <font> elements within the outer <font> element
        #     font_elements = re.findall(r'<font[^>]*>.*?</font>', lecturer_raw)
        #     # Extract the text content of the <li> elements
        #     li_text = [li for font in font_elements for li in re.findall(r'<li>.*?</li>', font)]
        #     # Remove the <li> tags from the extracted text
        #     li_text = [re.findall(r'<li>(.*?)<\/li>', nameLecture)[0].replace('<li>', ' / ') for nameLecture in li_text]
        #     # Join the extracted text with a delimiter
        #     lecturer = ' / '.join(li_text)

        #     # Find the first <font> element
        #     first_font = re.search(r'<font[^>]*>(.*?)</font>', lecturer_raw)

        #     # Remove any nested <font> elements within the first <font> element
        #     content = re.sub(r'<font[^>]*>.*?</font>', '', first_font.group(1))
        #     # Find the content before the <font> tag
        #     match = re.search(r'(.*?)<font', content)

        #     # Extract the content
        #     if match:
        #         content = match.group(1)
        #     else:
        #         content = ""

        #     mid = None
        #     final = None

        #     try:
        #         split_data = time.split("สอบปลายภาค")
        #         mid = split_data[0].strip().split("สอบกลางภาค")[1].strip()
        #     except:
        #         pass

        #     try:
        #         split_data = time.split("สอบปลายภาค")
        #         final = split_data[1].strip()
        #     except:
        #         pass


        #     try:
        #         split_data = time.split("สอบกลางภาค")
        #         time = split_data[0].strip()
        #     finally:
        #         try:
        #             split_data = time.split("สอบปลายภาค")
        #             time = split_data[0].strip()
        #         except:
        #             pass

        #     # Define the regular expression pattern
        #     pattern = r'(\d+)([A-Za-z])'
        #     # Find all matches in the string
        #     matches = re.findall(pattern, time)
        #     # Insert "&" between the number and alphabet character
        #     time = re.sub(pattern, r'\1 & \2', time)

        #     # set type
        #     type = "GE-"+code[3:4]

        #     # Create a dictionary for each course and append it to the data list
        #     course = {
        #         'type': type,
        #         'code': code,
        #         'name': name,
        #         'note': content,
        #         'credit': credit,
        #         'time': time,
        #         'sec': sec,
        #         'remain':remain,
        #         'receive': receive,
        #         'mid': mid,
        #         'final': final,
        #         'lecturer': lecturer
        #     }
        #     self.dataALL.append(course)


    # GE process data
    def scrap_ge_data(self, f_data: str = None, coursecode:str = "004*"):
        # set post data
        if not f_data:
            f_data = {
                'facultyid': 'all',
                'maxrow': '1000',
                'Acadyear': self.year,
                'semester': self.semester,
                'coursecode': coursecode,
            }
     
        # request web page with post method
        response = requests.post('https://reg.msu.ac.th/registrar/class_info_1.asp', headers=self.headers, data=f_data)

        # check status
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            return
        
        # convert from windows-874 charset to utf-8
        response.encoding = "windows-874"

        content_windows874 = response.content
        content_utf8 = content_windows874.decode("TIS-620").encode("utf-8")

        # BeautifulSoup
        resp = BeautifulSoup(content_utf8, 'html.parser')

        # select table by CSS selector
        soup = resp.select_one('body > div.contenttive > div:nth-child(1) > div.main > div > table:nth-child(6)')


        # Find all rows in the table, excluding the header and footer rows
        rows = soup.find_all('tr', class_='normalDetail')[1:-1]

        # Iterate over each row and extract the required information
        for row in rows:
            cells = row.find_all('td')
            code = cells[1].find('a').text.strip()
            subject_data = cells[2].decode_contents().split("<br/>")
            # TODO: มี font หลุดเข้ามาบางอัน
            name = subject_data[0].split("<font")[0]
            credit = cells[3].text.strip()
            time = cells[4].text.strip()
            sec = int(cells[5].text.strip())
            remain = int(cells[8].text.strip())
            receive = int(cells[6].text.strip())

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
            li_text = [re.findall(r'<li>(.*?)<\/li>', nameLecture)[0].replace('<li>', ' / ') for nameLecture in li_text]
            # Join the extracted text with a delimiter
            lecturer = ' / '.join(li_text)

            # Find the first <font> element
            first_font = re.search(r'<font[^>]*>(.*?)</font>', lecturer_raw)

            # Remove any nested <font> elements within the first <font> element
            content = re.sub(r'<font[^>]*>.*?</font>', '', first_font.group(1))
            # Find the content before the <font> tag
            match = re.search(r'(.*?)<font', content)

            # Extract the content
            if match:
                content = match.group(1)
            else:
                content = ""

            mid = None
            final = None

            try:
                split_data = time.split("สอบปลายภาค")
                mid = split_data[0].strip().split("สอบกลางภาค")[1].strip()
            except:
                pass

            try:
                split_data = time.split("สอบปลายภาค")
                final = split_data[1].strip()
            except:
                pass


            try:
                split_data = time.split("สอบกลางภาค")
                time = split_data[0].strip()
            finally:
                try:
                    split_data = time.split("สอบปลายภาค")
                    time = split_data[0].strip()
                except:
                    pass

            # Define the regular expression pattern
            pattern = r'(\d+)([A-Za-z])'
            # Find all matches in the string
            matches = re.findall(pattern, time)
            # Insert "&" between the number and alphabet character
            time = re.sub(pattern, r'\1 & \2', time)

            # set type
            type = "GE-"+code[3:4]

            # Create a dictionary for each course and append it to the data list
            course = {
                'type': type,
                'code': code,
                'name': name,
                'note': content,
                'credit': credit,
                'time': time,
                'sec': sec,
                'remain':remain,
                'receive': receive,
                'mid': mid,
                'final': final,
                'lecturer': lecturer
            }
            self.dataALL.append(course)

        # check next page
        try:
            if soup.find_all('tr', class_='normalDetail')[-1].select_one('td:nth-child(2) > a')['href']:
                # set next page data
                next_f_data = soup.find_all('tr', class_='normalDetail')[-1].select_one('td:nth-child(2) > a')['href'].split('class_info_1.asp?')[1]
                print(next_f_data)
                return self.scrap(next_f_data)
        except Exception:
            pass
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

