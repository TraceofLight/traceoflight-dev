pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build Web') {
      steps {
        sh '''
          docker run --rm \
            -u "$(id -u):$(id -g)" \
            -v "$PWD/apps/web:/app" \
            -w /app \
            node:20-bookworm-slim \
            sh -lc "npm ci && npm run build"
        '''
      }
    }

    stage('Deploy Web Container') {
      steps {
        dir('apps/web') {
          sh 'docker compose up -d --build --remove-orphans'
        }
      }
    }
  }
}
