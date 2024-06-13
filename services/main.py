# Import modules
import os
from university.msu import MSU

import psycopg2
import configparser

import datetime
import time
import multiprocessing

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
    rows = cur.fetchall()
    con.commit()
    # con.close()

    if len(rows) == 1:
        q = 'SELECT * from seamster_detail LEFT JOIN seamster_rounding ON seamster_detail.seamster_id = seamster_rounding.seamster_id WHERE uni_id = %s AND CURRENT_DATE <= ss_end ORDER BY ss_start;'
        cur.execute(q, (rows[0],))
        rows = cur.fetchall()
        con.commit()

        for row in rows:
            print(row)

pg_i_main = 'main'

def getInput(state='m'):
    inp = input()
    if inp == 'x' and state != 'main':
        return f'main'
    return f'{state}{inp}'

def startUp():
    m1res = []
    m2res = []
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

def run_get_all_subjects():
    m1res = config['scrap'].get('courses').split(',')
    start_time = time.time()

    print("get subjects data")  # Output: 01
    # print("GE")  # Output: 01
    # MSU.scrap_courses_data(year=year, semester=semester, coursecode='00*')
    tasks = []
    # tasks.append((year, semester, None, '00*'))
    for i in m1res:
        formatted_number = str(i).zfill(2)
        tasks.append((year, semester, None, f'{formatted_number}*'))
        # print(formatted_number)  # Output: 01
        # MSU.scrap_courses_data(year=year, semester=semester, coursecode=f'{formatted_number}*')
        # m2res.append((i, MSU.scrap_courseset_list(facultyid=i)))

    with multiprocessing.Pool() as pool:
        pool.starmap(MSU.scrap_courses_data, tasks)

    end_time = time.time()
    process_time = end_time - start_time
    print(f"Process time: {process_time} seconds")

if __name__ == '__main__':
    year = 2567
    semester = 1
    # m1res = MSU.scrap_fac_data()
    run_get_all_subjects()
    
    # getUniverselData()