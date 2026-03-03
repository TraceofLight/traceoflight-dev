pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build Web') {
      steps {
        dir('apps/web') {
          sh 'npm ci'
          sh 'npm run build'
        }
      }
    }

    stage('Deploy Web Container') {
      steps {
        dir('apps/web') {
          sh 'docker compose up -d --build'
        }
      }
    }
  }
}
