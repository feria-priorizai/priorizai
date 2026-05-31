# Jenkins Local

El proyecto utiliza Jenkins como herramienta de CI/CD. Para efectos de desarrollo y validación local, Jenkins se ejecuta mediante Docker.

## Levantar Jenkins

```powershell
docker run -d `
  --name jenkins `
  -p 8080:8080 `
  -p 50000:50000 `
  -v jenkins_home:/var/jenkins_home `
  jenkins/jenkins:lts