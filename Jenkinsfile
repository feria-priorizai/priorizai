pipeline {
    agent any

    stages {
        stage('Build backend image') {
            steps {
                sh 'docker build -t priorizai-backend ./backend'
            }
        }

        stage('Ruff') {
            steps {
                sh 'docker run --rm priorizai-backend ruff check .'
            }
        }

        stage('Black') {
            steps {
                sh 'docker run --rm priorizai-backend black --check .'
            }
        }

        stage('Mypy') {
            steps {
                sh 'docker run --rm priorizai-backend mypy .'
            }
        }

        stage('Pytest') {
            steps {
                sh 'docker run --rm priorizai-backend pytest'
            }
        }
    }
}