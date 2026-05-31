pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install dependencies') {
            steps {
                dir('backend') {
                    sh 'python -m pip install --upgrade pip'
                    sh 'pip install -r requirements.txt'
                }
            }
        }

        stage('Ruff') {
            steps {
                dir('backend') {
                    sh 'ruff check .'
                }
            }
        }

        stage('Black') {
            steps {
                dir('backend') {
                    sh 'black --check .'
                }
            }
        }

        stage('Mypy') {
            steps {
                dir('backend') {
                    sh 'mypy .'
                }
            }
        }

        stage('Pytest') {
            steps {
                dir('backend') {
                    sh 'pytest'
                }
            }
        }

        stage('Docker build') {
            steps {
                sh 'docker build -t priorizai-backend ./backend'
            }
        }
    }
}