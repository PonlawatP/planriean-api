# Import modules
from university.msu import MSU

import psycopg2
import configparser

import datetime
from datetime import date, datetime
import time
import multiprocessing
import schedule
import asyncio

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

cur = con.cursor()

def getUniverselData():
    uni_key = config['scrap'].get('university')
    query = 'select uni_id from university_detail where LOWER(uni_key) = LOWER(%s);'
    cur.execute(query, (uni_key,))
    pre_rows = cur.fetchall()
    con.commit()
    out_of_round = False
    # con.close()

    if len(pre_rows) == 1:
        q = 'SELECT uni_id, year, seamster_round, ss_round, std_year, ss_start, ss_end from seamster_detail LEFT JOIN seamster_rounding ON seamster_detail.seamster_id = seamster_rounding.seamster_id WHERE uni_id = %s AND CURRENT_DATE <= ss_end ORDER BY ss_start;'
        cur.execute(q, (pre_rows[0],))
        rows = cur.fetchall()
        con.commit()

        # ถ้ามีวันที่โชว์
        if len(rows) >= 1:
            year = rows[0][1]
            semaster = rows[0][2]
            round = rows[0][3]
            collegian_year = rows[0][4]
            start_date = rows[0][5]
            end_date = rows[0][6]
        else:
            out_of_round = True
            q = '''SELECT
                    uni_id,
                    YEAR,
                    seamster_round,
                    ss_round,
                    std_year,
                    ss_start,
                    ss_end 
                FROM
                    seamster_detail
                    LEFT JOIN seamster_rounding ON seamster_detail.seamster_id = seamster_rounding.seamster_id 
                WHERE
                    uni_id = %s
                    AND ss_end is not null
                ORDER BY
                    ss_end DESC
                LIMIT 1;'''

            cur.execute(q, (pre_rows[0],))
            rows = cur.fetchall()
            con.commit()

            # ถ้ามีวันที่โชว์
            if len(rows) >= 1:
                year = rows[0][1]
                semaster = rows[0][2]
                round = rows[0][3]
                collegian_year = rows[0][4]
                start_date = rows[0][5]
                end_date = rows[0][6]
            else:
                year = 0
                semaster = 0
                round = 0
                collegian_year = 0
                start_date = 0
                end_date = 0
            # print(start_date, today < start_date,end_date, today <= end_date, start_date == today, not (today < start_date and today <= end_date))

        # for row in rows:
        #     print(row)
    if out_of_round:
        return {
            "collapsed": False,
            "first_day": False,
            "time": date.today(),
            "data": {
                "year": year,
                "semaster": semaster,
                "round": round,
                "collegian_year": collegian_year,
                "start_date": start_date,
                "end_date": end_date,
            },
        }
    else:
        return {
            "collapsed": date.today() >= start_date or date.today() > end_date,
            "first_day": start_date == date.today(),
            "time": date.today(),
            "data": {
                "year": year,
                "semaster": semaster,
                "round": round,
                "collegian_year": collegian_year,
                "start_date": start_date,
                "end_date": end_date,
            },
        }


def getInput(state='m'):
    inp = input()
    if inp == 'x' and state != 'main':
        return f'main'
    return f'{state}{inp}'

def startUp():
    m1res = []
    m2res = []
    pg_i_main = 'main'
    while True:
        if pg_i_main == 'main':
            print("Planriean Data Service Script")
            print("Choose Program Group")
            print("[1] Get Faculty list")
            print("[2] Courseset")
            print("[3] Get Courses")
            print("[4] ")
            print("[5] ")
            pg_i_main = getInput('m')
        elif pg_i_main == 'm1':
            m1res = MSU.scrap_fac_data()
            pg_i_main = "main"
        elif pg_i_main == 'm2':
            print("Select Process")
            print("[1] Update Faculty list")
            print("[2] Update Faculty Detail")
            print("[x] Main Menu")
            pg_i_main = getInput('m2')
        elif pg_i_main == 'm21':
            for i in m1res:
                print(i)
                m2res.append((i, MSU.scrap_courseset_list(facultyid=i)))
            # MSU.scrap_courseset_list()
            print(m2res)
            pg_i_main = "m2"
        elif pg_i_main == 'm22':
            for i in m2res:
                for j in i[1]:
                    print(f'current: {i[0]} | {j}')
                    MSU.scrap_courseset_detail(facultyid=i[0], courseset_id=j)
            # MSU.scrap_courseset_detail(2, 1025005)
            # MSU.scrap_courseset_detail()
            pg_i_main = "m2"
        elif pg_i_main == 'm3':
            today = datetime.date.today()

            year = today.year+543
            year = int(input(f'Enter the year (default: {year}): ').strip() or year)
            semester = int(input(f'Enter the semester (default: 1): ').strip() or 1)
            # coursecode = input(f'Enter the coursecode (default: "00*"): ').strip() or '00*'
            # MSU.scrap_courses_data(year=year, semester=semester, coursecode=coursecode)``
            start_time = time.time()

            MSU.scrap_courses_data(year=year, semester=semester, coursecode='00*')
            for i in m1res:
                formatted_number = str(i).zfill(2)
                print(formatted_number)  # Output: 01
                MSU.scrap_courses_data(year=year, semester=semester, coursecode=f'{formatted_number}*')
                # m2res.append((i, MSU.scrap_courseset_list(facultyid=i)))

            end_time = time.time()
            process_time = end_time - start_time
            print(f"Process time: {process_time} seconds")
            pg_i_main = "main"
        print('==================================')

async def run_get_all_subjects(year = 2567, semester = 1):
    global isRegisScrapRunning
    m1res = config['scrap'].get('courses').split(',')
    start_time = time.time()


    # print("get subjects data")  # Output: 01
    # print("GE")  # Output: 01
    # MSU.scrap_courses_data(year=year, semester=semester, coursecode='00*')
    tasks = []
    # tasks.append((year, semester, None, '00*'))
    for i in m1res:
        formatted_number = str(i).zfill(2)
        tasks.append((year, semester, None, f'{formatted_number}*', isRegisScrapRunning == False))
        # print(formatted_number)  # Output: 01
        # MSU.scrap_courses_data(year=year, semester=semester, coursecode=f'{formatted_number}*')
        # m2res.append((i, MSU.scrap_courseset_list(facultyid=i)))

    ctx = multiprocessing.get_context('spawn')
    with ctx.Pool() as pool:
        pool.starmap(MSU.scrap_courses_data, tasks)

    # print('sad')

    end_time = time.time()
    process_time = end_time - start_time
    current_time = datetime.now().strftime("%H:%M:%S")
    print(f"{current_time}: done in {process_time:.2f} seconds.")



if __name__ == '__main__':
    # m1res = MSU.scrap_fac_data()
    # run_get_all_subjects()
    # startUp()

    r = None
    isRegisScrapRunning = False
    scheduled_job = None
    loop = asyncio.get_event_loop()

    try:
        multiprocessing.freeze_support()
        registration_refresh_inteval = config['scrap'].get('registration_refresh_inteval')
        isTaskScrap = False

        def runningRegisScrap():
            global r, isTaskScrap
            # ถ้าของเก่ายังทำไม่เสร็จ => Dump
            if isTaskScrap == True:
                return

            isTaskScrap = True
            uni_key = config['scrap'].get('university')
            # print(r['data']['year'],r['data']['semaster'],datetime.now(), uni_key)

            tasks = [
                loop.create_task(run_get_all_subjects(r['data']['year'],r['data']['semaster'])),
            ]
            loop.run_until_complete(asyncio.wait(tasks))
            # # print('sad 4')
            query = 'UPDATE "public"."university_detail" SET "refresh_updated_at" = %s WHERE LOWER(uni_key) = LOWER(%s);'
            cur.execute(query, (datetime.now(), uni_key,))
            con.commit()

            isTaskScrap = False

        def checkingRegisTime():
            global r, scheduled_job, isRegisScrapRunning
            # ดึงข้อมูลที่เกี่ยวกับช่วงวันที่ลงทะเบียนมาเช็คก่อน
            r = getUniverselData()
            # print(r)
            print(f'  Time Checking ({r["time"]})...')
            # print(r['data']['year'],r['data']['semaster'])
            print(f'  Current Semester: {r["data"]["year"]} [{r["data"]["semaster"]}]\n')
            if r['collapsed'] == True and isRegisScrapRunning == False:
                print("\t== In-Registration Event Detected ==\n")
                # ถ้าเข้า gap ลงทะเบียน => 5 วิโหลดข้อมูล
                if scheduled_job is not None:
                    schedule.cancel_job(scheduled_job)
                isRegisScrapRunning = True
                runningRegisScrap()
                scheduled_job = schedule.every(int(registration_refresh_inteval)).seconds.do(runningRegisScrap)
            elif r['collapsed'] == False:
                # ถ้าไม่เข้า gap ลงทะเบียน โหลดข้อมูลวันละครั้ง
                if scheduled_job is not None:
                    schedule.cancel_job(scheduled_job)
                isRegisScrapRunning = False
                runningRegisScrap()
                scheduled_job = schedule.every(86400).seconds.do(runningRegisScrap)

        # first run. then leave it to schedule
        scr = config['scrap'].get('courses')
        uni_key = config['scrap'].get('university')
        query = 'select uni_id from university_detail where LOWER(uni_key) = LOWER(%s);'
        cur.execute(query, (uni_key,))
        row = cur.fetchone()
        con.commit()

        print("\nPlanriean Subjects Scraping System")
        print(f'  {uni_key.upper()}\'s ID: {row}')
        print(f'  Get {len(scr.split(","))} Courses:')
        print(f'    {scr}')
        print(f'  every: {registration_refresh_inteval} seconds')
        print("")

        checkingRegisTime()
        schedule.every(3600).seconds.do(checkingRegisTime)

        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        loop.close()
        cur.close()
        con.close()
        print("Program interrupted by user. Exiting gracefully...")