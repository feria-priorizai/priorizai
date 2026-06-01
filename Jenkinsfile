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

        stage('Build frontend image') {
            steps {
                sh 'docker build -t priorizai-frontend ./frontend'
            }
        }

        stage('Frontend lint') {
            steps {
                sh 'docker run --rm priorizai-frontend npm run lint'
            }
        }

        stage('Frontend build') {
            steps {
                sh 'docker run --rm priorizai-frontend npm run build'
            }
        }
    }
}
