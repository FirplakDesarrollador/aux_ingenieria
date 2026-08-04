const SAP_COMPANY_DB = process.env.SAP_COMPANY_DB;
const SAP_USERNAME = process.env.SAP_USERNAME;
const SAP_PASSWORD = process.env.SAP_PASSWORD;
const SAP_API_URL = process.env.SAP_API_URL;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function fetchMetadata() {
    try {
        const loginRes = await fetch(SAP_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                CompanyDB: SAP_COMPANY_DB,
                UserName: SAP_USERNAME,
                Password: SAP_PASSWORD,
            }),
        });

        const loginData = await loginRes.json();
        const sessionId = loginData.SessionId;

        // Try to fetch UDF valid values for Items
        // The table for Item Master Data is 'OITM'
        const url = SAP_API_URL.replace("/Login", "/UserFieldsMD?$filter=TableName eq 'OITM' and (Name eq 'Version' or Name eq 'Color')");
        console.log("Fetching", url);

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `B1SESSION=${sessionId}; ROUTEID=.node0`,
            }
        });

        const data = await res.json();
        console.log("UserFieldsMD:", JSON.stringify(data, null, 2));

    } catch (e) {
        console.error(e);
    }
}
fetchMetadata();
