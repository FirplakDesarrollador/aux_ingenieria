const SAP_COMPANY_DB = process.env.SAP_COMPANY_DB;
const SAP_USERNAME = process.env.SAP_USERNAME;
const SAP_PASSWORD = process.env.SAP_PASSWORD;
const SAP_API_URL = process.env.SAP_API_URL;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function testFetchUDT() {
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

        // Try U_FIR_COLOR
        const url = SAP_API_URL.replace("/Login", "/U_FIR_COLOR?$top=5");
        console.log("Fetching", url);

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Cookie": `B1SESSION=${sessionId}; ROUTEID=.node0`,
            }
        });

        const data = await res.json();
        console.log("FIR_COLOR:", JSON.stringify(data, null, 2));

        // Try U_FIR_VERSION
        const url2 = SAP_API_URL.replace("/Login", "/U_FIR_VERSION?$top=5");
        const res2 = await fetch(url2, {
            method: "GET",
            headers: {
                "Cookie": `B1SESSION=${sessionId}; ROUTEID=.node0`,
            }
        });

        const data2 = await res2.json();
        console.log("FIR_VERSION:", JSON.stringify(data2, null, 2));

    } catch (e) {
        console.error(e);
    }
}
testFetchUDT();
