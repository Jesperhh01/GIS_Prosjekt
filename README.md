# GIS_Prosjekt

Tekniske krav for å kjøre GIS_Prosjekt
- Node Package Manager (NPM) 8+
- PostgreSQL med PostGis mulighet
- .NET 8

Instruksjoner
1. Opprett en ny PostgreSQL-database og aktiver PostGIS-utvidelsen.
2. Last ned SQL-dumpen fra følgende lenke: https://drive.google.com/file/d/1yr3PDW2shhNX4mzdiwTGTUX5kXKIi8mY/view?usp=sharing
3. Bruk psql til å importere data: 
    ```
    psql -d geodata -f geodata.sql
    ```
4. Legg inn tilkoblingsstrengen til databasen enten i appsettings.json eller via .NET User Secrets.
5. Kjør følgende kommando i prosjektets rotmappe for å installere nødvendige avhengigheter: 
    ```
    npm install
    ```
6.  Start prosjektet via ditt foretrukne utviklingsmiljø (f.eks. Visual Studio eller Rider), med HTTP-profilen valgt
    
    - Eller fra terminalen med følgende kommando:
        ```
        dotnet run --launch-profile "http"
        ```
7.  Kjør utviklingsserveren med:
    ```
    npm run dev
    ```
    Sørg for at denne kjører parallelt med .NET-applikasjonen.
8. Til slutt, åpne http://localhost:5164/ i nettleser.