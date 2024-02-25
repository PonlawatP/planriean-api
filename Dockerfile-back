# Use an official Python runtime as a parent image
FROM python:3

# Install Node.js and npm
RUN apt-get update
RUN apt-get install -y ca-certificates curl gnupg
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

ENV NODE_MAJOR=20
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

RUN apt-get update
RUN apt-get install nodejs -y

# Create a directory for your app
WORKDIR /subj_api_app

COPY . .

# Install Python and Node.js dependencies (replace with actual commands)
RUN pip install -r requirements.txt
RUN npm install -f

EXPOSE 3030

CMD ["node", "index.js", "-t", "86400"]
