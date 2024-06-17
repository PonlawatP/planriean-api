# right now

- plutopon/planriean-subjects-msu:latest # all faculty code
- plutopon/planriean-subjects-msu-1:latest # from 0,1,2,3,4,5,7
- plutopon/planriean-subjects-msu-2:latest # from 8,9,10,11,12,13,14,15,17,20,22,23,24

# code run container in docker (same network)

docker run -d --pull=always --name planriean-msu --network nginx_planriean -v /etc/localtime:/etc/localtime:ro plutopon/planriean-subjects-msu:latest

# code run container in docker (outside network)

docker run -d --pull=always --name planriean-msu --add-host planriean-db:192.168.192.1 -v /etc/localtime:/etc/localtime:ro plutopon/planriean-subjects-msu:latest
