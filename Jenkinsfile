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
                sh '''
                    set +e
                    docker run --name priorizai-cov-${BUILD_NUMBER} \
                        priorizai-backend \
                        pytest --cov-report=xml:coverage.xml
                    status=$?
                    docker cp priorizai-cov-${BUILD_NUMBER}:/app/coverage.xml coverage.xml || true
                    docker rm -f priorizai-cov-${BUILD_NUMBER} >/dev/null 2>&1 || true
                    exit $status
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'coverage.xml', allowEmptyArchive: true
                }
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
