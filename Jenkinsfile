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

    stage('Build And Deploy Web') {
      steps {
        dir('apps/web') {
          sh 'docker compose up -d --build --remove-orphans'
        }
      }
    }
  }
}
