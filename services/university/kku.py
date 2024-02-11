class KKU:
    # Initial
    def __init__(self):
        # init data
        self.dataALL = []
        self.lock = threading.Lock()

    # Get all subjects
    def getSubjectsID(self, f_data: str = None, data: set = set()):
        # set default f_data
        f_data = {
            'coursestatus': 'O00',
            'facultyid': '051General',
            'maxrow': '1000',
            'Acadyear': year,
            'Semester': semester,
        } if not f_data else f_data

        # request web page with post method
        response = requests.post(
            'https://reg-mirror.kku.ac.th/registrar/class_info_1.asp',
            headers=headers,
            data=f_data,
        )

        # bs4
        resp = BeautifulSoup(response.content, 'html.parser')

        # select table by CSS selector
        soup = resp.select('table')[1]

        # Find all rows in the table, excluding the header and footer rows
        rows = soup.find_all('tr', class_='NormalDetail')
        for row in rows:
            # get cells
            cells = row.find_all('td')
            # get id
            id = cells[1].find('a')['href'].split('courseid=')[1].split('&')[0]
            # add id to data
            data.add(id)

        # get nextPages
        try:
            # if next page is not None
            if soup.find_all('tr')[-1].select_one('td:nth-child(2) > a')['href']:
                # get next page
                next_f_data = soup.find_all('tr')[-1].select_one('td:nth-child(2) > a')['href'].split('class_info_1.asp?')[1]
                return self.getSubjectsID(next_f_data)
        except Exception:
            pass

        return data

    # Get details
    def getDetails(self, id: str):
        # set params
        params = {
            'courseid': id,
            'acadyear': year,
            'semester': semester,
        }
        
        # request web page with get method
        response = requests.get(
            'https://reg-mirror.kku.ac.th/registrar/class_info_2.asp',
            params=params,
            headers=headers,
        )

        # bs4
        resp = BeautifulSoup(response.content, 'html.parser')

        # select table by CSS selector
        soup = resp.select('table')[3]

        # remove header in table
        for header in soup.find_all(class_="HeaderDetail"):
            header.extract()

        # get rows
        rows = soup.find_all('tr')
        for index in range(4, len(rows)):
            row = rows[index]
            # check if row is not subject
            if len(row.find_all('td')) < 10:
                continue
            
            # get cells, sec, get day, time, room, recive, remain
            cells = row.find_all('td')
            sec = int(str(cells[1].text.strip()))
            day = cells[3].text.strip()
            time = cells[4].text.strip()
            room = cells[5].text.strip()
            recive = int(cells[8].text.strip())
            remain = int(cells[10].text.strip())

            # set format day
            day = "Mo" if day == "จันทร์" else "Tu" if day == "อังคาร" else "We" if day == "พุธ" else "Th" if day == "พฤหัสบดี" else "Fr"

            # get info
            info_htmls = [
                rows[index+1].find_all('td'), rows[index+3].find_all('td')]

            lecturer, fin = [info[4].text.strip().replace(
                "  ", "") or None for info in info_htmls]

            # init sumrong
            sumrong = ""

            if rows[index+2].find_all('td')[4].find_all('br'):
                for br in rows[index+2].find_all('td')[4].find_all('br'):
                    sumrong += br.next_sibling.strip() + " / "
                sumrong = sumrong.replace("  ", "").replace("   ", " ")[:-3]
            else:
                sumrong = rows[index+2].find_all(
                    'td')[4].text.strip().replace("  ", "").replace("   ", " ")

            mid = None

            # get code, name, credit, type
            code = resp.select('font.NormalDetail')[0].text.strip()
            name = resp.select('font.NormalDetail')[1].text.strip()
            credit = resp.select('font.NormalDetail')[6].text.strip()
            type = "GE-"+code[2:3]

            # set course
            course = {
                'type': type,
                'code': code,
                'name': name,
                'note': sumrong,
                'credit': credit,
                'time': f'{day}{time} {room}',
                'sec': sec,
                'remain': remain,
                'recive': recive,
                'mid': mid,
                'fin': fin,
                'lecturer': lecturer,
            }

            # append more attribute to data to dataALL refer id and sec
            with self.lock:
                self.dataALL.append(course)

    def splitData(self):
        # Create a dictionary for each course and append it to the data list
        GE = {}
        
        for course in self.dataALL:
            if course['type'] not in GE:
                GE[course['type']] = []
            GE[course['type']].append(course)
            
        # Save the JSON data to the file
        for key in GE:
            with open(f"Group/KKU/{key}.json", "w", encoding="utf-8") as file:
                json.dump(GE[key], file, indent=4, ensure_ascii=False)

    # run
    def run(self):
        # get subjects
        subjects = self.getSubjectsID()
        threads = []
        # get details
        for subject in subjects:
            t = threading.Thread(target=self.getDetails, args=(subject,))
            threads.append(t)
            t.start()

        # wait for all threads to finish
        for t in threads:
            t.join()

        # sort data by remain most
        self.dataALL.sort(key=lambda x: x['remain'], reverse=True)

        # split data
        self.splitData()
        

        # save data to json file
        with open('Group/KKU/dataALL.json', 'w', encoding='utf-8') as f:
            json.dump(self.dataALL, f, ensure_ascii=False, indent=4)
