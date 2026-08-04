const fs = require('fs');
const pdf = require('pdf-parse');

const pdfPath = 'C:\\Users\\auxingenieria\\.gemini\\antigravity\\brain\\44d3630b-7987-4153-872d-a2395a6a0b67\\.tempmediaStorage\\1ac92f5deb526b0f.pdf';

let dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function(data) {
    // number of pages
    console.log("Pages:", data.numpages);

    // text
    console.log("First 2000 chars of text:\n", data.text.substring(0, 2000));

    // Let's search for "kit" or "compatib"
    const text = data.text.toLowerCase();
    const lines = text.split('\n');
    console.log("\n--- Lines with 'kit' or 'compatib' ---");
    lines.forEach((line, index) => {
        if (line.includes('kit') || line.includes('compatib') || line.includes('restric')) {
            console.log(`[Line ${index}]: ${line}`);
        }
    });

}).catch(err => {
    console.error("Error parsing PDF:", err);
});
