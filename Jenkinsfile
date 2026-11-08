// =============================================================================
// JENKINS DECLARATIVE PIPELINE (BUỔI 9 - CI/CD AUTOMATION)
// Học phần: Đồ án Phát triển Ứng dụng phía Máy chủ Nâng cao (Mã HP: 608819)
// Đề tài: Smart Office - Hệ thống Quản lý Văn phòng Thông minh (AIoT & Computer Vision)
// Kiến trúc: .NET 10 Modular Monolith (5 Modules) + Python FastAPI ONNX + React + MinIO/S3
// =============================================================================

pipeline {
    agent any

    triggers {
        // Tự động kích hoạt Pipeline khi có sự kiện Push hoặc Merge Pull Request từ GitHub Webhook
        githubPush()
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }

    environment {
        COMPOSE_FILE               = 'deploy/docker-compose.yml'
        DOTNET_CLI_TELEMETRY_OPTOUT = '1'
        DOTNET_NOLOGO              = '1'
        POSTGRES_DB                = 'smartoffice_db'
        POSTGRES_USER              = 'postgres'
        OBJECT_STORAGE_BUCKET      = 'smartoffice-media'
    }

    stages {
        stage('1. Checkout & Git Metadata') {
            steps {
                echo '=== [STAGE 1] Đồng bộ mã nguồn từ GitHub Repository ==='
                checkout scm
                script {
                    if (isUnix()) {
                        sh 'git --version && git log -n 3 --oneline'
                    } else {
                        bat 'git --version && git log -n 3 --oneline'
                    }
                }
            }
        }

        stage('2. Backend .NET 10: Build & Architecture Isolation Tests') {
            steps {
                echo '=== [STAGE 2] Kiểm tra Kiến trúc Modular Monolith (5 Modules) & Chạy Unit Tests ==='
                dir('backend') {
                    script {
                        if (isUnix()) {
                            sh '''
                                dotnet restore SmartOffice.slnx
                                dotnet build SmartOffice.slnx --configuration Release --no-restore
                                dotnet test SmartOffice.slnx --configuration Release --no-build --verbosity normal
                            '''
                        } else {
                            bat '''
                                dotnet restore SmartOffice.slnx
                                dotnet build SmartOffice.slnx --configuration Release --no-restore
                                dotnet test SmartOffice.slnx --configuration Release --no-build --verbosity normal
                            '''
                        }
                    }
                }
            }
        }

        stage('3. AI Service Python 3.12: Unit Tests (FSM & Face Pipeline)') {
            steps {
                echo '=== [STAGE 3] Kiểm thử Đơn vị Dịch vụ AI (17 Unit Tests: RT-DETR, SCRFD, ArcFace, MiniFASNet) ==='
                dir('ai_service') {
                    script {
                        if (isUnix()) {
                            sh 'python3 -m unittest discover -s tests -v'
                        } else {
                            bat 'python -m unittest discover -s tests -v'
                        }
                    }
                }
            }
        }

        stage('4. Frontend React + TypeScript: Lint & Production Bundle') {
            steps {
                echo '=== [STAGE 4] Kiểm tra mã nguồn Frontend (oxlint) & Đóng gói Vite Production ==='
                dir('frontend') {
                    script {
                        if (isUnix()) {
                            sh '''
                                npm ci
                                npm run lint
                                npm run build
                            '''
                        } else {
                            bat '''
                                npm ci
                                npm run lint
                                npm run build
                            '''
                        }
                    }
                }
            }
        }

        stage('5. Docker Compose Validation & Multi-Stage Image Build') {
            steps {
                echo '=== [STAGE 5] Kiểm tra cú pháp Docker Compose & Build Multi-stage Images ==='
                script {
                    if (isUnix()) {
                        sh '''
                            docker compose -f ${COMPOSE_FILE} config -q
                            docker compose -f ${COMPOSE_FILE} build
                        '''
                    } else {
                        bat '''
                            docker compose -f %COMPOSE_FILE% config -q
                            docker compose -f %COMPOSE_FILE% build
                        '''
                    }
                }
            }
        }

        stage('6. Deploy Multi-Container Stack (6 Services)') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                echo '=== [STAGE 6] Triển khai Hệ thống 6 Containers trên mạng cô lập smartoffice_net ==='
                script {
                    if (isUnix()) {
                        sh 'docker compose -f ${COMPOSE_FILE} up -d --remove-orphans'
                    } else {
                        bat 'docker compose -f %COMPOSE_FILE% up -d --remove-orphans'
                    }
                }
            }
        }

        stage('7. Post-Deploy Smoke Test & Healthcheck') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                echo '=== [STAGE 7] Kiểm tra trạng thái hoạt động thực tế của các Container sau triển khai ==='
                script {
                    if (isUnix()) {
                        sh '''
                            sleep 10
                            docker ps --filter "name=smartoffice"
                            curl -f http://localhost:5000/api/health
                            curl -f http://localhost:9000/minio/health/live
                            curl -f http://localhost/
                        '''
                    } else {
                        powershell '''
                            Start-Sleep -Seconds 10
                            docker ps --filter "name=smartoffice" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
                            Invoke-RestMethod -Uri "http://localhost:5000/api/health" | ConvertTo-Json -Depth 3
                            Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -UseBasicParsing | Select-Object StatusCode
                            Invoke-WebRequest -Uri "http://localhost/" -UseBasicParsing | Select-Object StatusCode
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo '✅ [SUCCESS] Pipeline CI/CD hoàn tất! Toàn bộ 5 Module Backend, AI Service, MinIO S3 và Frontend đã sẵn sàng.'
        }
        failure {
            echo '❌ [FAILURE] Pipeline CI/CD phát hiện lỗi trong quá trình Build/Test/Deploy. Vui lòng kiểm tra Console Output.'
        }
        always {
            echo '=== Kết thúc phiên chạy Jenkins CI/CD Pipeline ==='
        }
    }
}

