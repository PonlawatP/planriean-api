# Import modules
import os
from university.msu import MSU

import psycopg2
import configparser

import datetime


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
query = query_schema + 'select * from courseset_detail;'

# cur.execute(query)
# rows = cur.fetchall()
# con.commit()
# con.close()
# for row in rows:
#     print(row)

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
        pg_i_main = f'm{input()}'
    elif pg_i_main == 'm1':
        MSU.scrap_fac_data()
        pg_i_main = "main"
    elif pg_i_main == 'm2':
        print("Select Process")
        print("[1] Update Faculty list")
        print("[2] Update Faculty Detail")
        pg_i_main = f'm2{input()}'
    elif pg_i_main == 'm21':
        MSU.scrap_courseset_list()
        pg_i_main = "m2"
    elif pg_i_main == 'm22':
        MSU.scrap_courseset_detail()
        pg_i_main = "m2"
    elif pg_i_main == 'm3':
        today = datetime.date.today()

        year = today.year+543-1
        year = int(input(f'Enter the year (default: {year}): ').strip() or year)
        semester = int(input(f'Enter the semester (default: 1): ').strip() or 1)
        coursecode = input(f'Enter the coursecode (default: "00*"): ').strip() or '00*'
        MSU.scrap_courses_data(year=year, semester=semester, coursecode=coursecode)
        pg_i_main = "main"
    print('==================================')

# === need to remove in future

# # paths
# folder = "group"
# paths = {
#     "msu",
#     "kku",
# }

# # check path if not create
# for path in paths:
#     path = os.path.join(folder, path)
#     if not os.path.exists(path):
#         os.makedirs(path)


# time record
# import time
# start = time.time()
# MSU().run()
# KKU().run()
# end = time.time()
# print(f"Runtime of the program is {end - start}")
