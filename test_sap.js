const SAP_COMPANY_DB = process.env.SAP_COMPANY_DB;
const SAP_USERNAME = process.env.SAP_USERNAME;
const SAP_PASSWORD = process.env.SAP_PASSWORD;
const SAP_API_URL = process.env.SAP_API_URL;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function testSAP() {
    console.log("Intentando conectar a SAP Service Layer...");
    console.log(`URL: ${SAP_API_URL}`);
    console.log(`DB: ${SAP_COMPANY_DB}`);
    console.log(`User: ${SAP_USERNAME}`);

    try {
        const response = await fetch(SAP_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                CompanyDB: SAP_COMPANY_DB,
                UserName: SAP_USERNAME,
                Password: SAP_PASSWORD,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log("¡Conexión exitosa!");
        console.log("Session ID:", data.SessionId);
        console.log("Version:", data.Version);
    } catch (error) {
        console.error("Falló la conexión:", error.message);
    }
}

testSAP();
