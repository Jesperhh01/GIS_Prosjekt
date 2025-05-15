# GIS_Prosjekt

Instruksjoner
1. Sett opp en PostgreSQL database med PostGis extension.
2. Last ned database dump: https://drive.google.com/file/d/1yr3PDW2shhNX4mzdiwTGTUX5kXKIi8mY/view?usp=sharing
3. Legg inn data med psql slik: `psql -d geodata_test -f geodata.sql`.
4. Sett opp en connectionString i .NET User Secrets eller i appsettings.json, som peker til databasen.
5. Kjør `npm install` i prosjektet root mappe.
6. Bygg og Kjør prosjektet.
7. Vær sikker på at `npm run dev` kjører i tillegg.