const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;
const LEADS_FILE = path.join(__dirname, 'leads.json'); // Fayl o'rnini soddalashtiramiz

// --- YANGI: Autentifikatsiya sozlamalari ---
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'intellium2023';

// Autentifikatsiya funksiyasi
const auth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === ADMIN_USER && password === ADMIN_PASS) {
        return next(); // Agar login va parol to'g'ri bo'lsa, keyingi qadamga o'tish
    }

    res.set('WWW-Authenticate', 'Basic realm="401"'); // Brauzerga parol so'rash oynasini chiqarishni aytish
    res.status(401).send('Autentifikatsiya talab qilinadi.'); // Xatolik xabari
};

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Admin panel va API yo'llari uchun autentifikatsiya
app.use('/admin.html', auth);
app.use('/admin.css', auth);
app.use('/admin.js', auth);
app.get('/api/leads', auth);
app.get('/api/leads/download', auth);

app.use(express.static(__dirname)); // Serve static files like index.html, admin.html

// Ensure leads.json exists
if (!fs.existsSync(LEADS_FILE)) {
    console.log("Leads.json fayli mavjud emas, yangi fayl yaratilmoqda...");
    fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
}

// API to get all leads (endi himoyalangan)
app.get('/api/leads', (req, res) => {
    console.log("So'rovlar ro'yxati so'raldi");
    fs.readFile(LEADS_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error("Leads faylini o'qishda xato:", err);
            return res.status(500).send('Error reading leads file.');
        }
        try {
            const leads = JSON.parse(data);
            console.log(`${leads.length} ta so'rov topildi`);
            res.json(leads);
        } catch (e) {
            console.error("JSON ni parse qilishda xato:", e);
            res.status(500).send('JSON parsing error.');
        }
    });
});

// API to submit a new lead (bu ochiq qoladi, parol so'ramaydi)
app.post('/api/leads', (req, res) => {
    console.log("Yangi so'rov qabul qilindi:", req.body);
    
    const newLead = {
        id: Date.now(),
        clientName: req.body.name,
        clientSurname: "",
        phone: req.body.phone,
        brandName: req.body.brand_name,
        personType: req.body.business_industry || "jismoniy",
        assignedTo: "tasdiqlanmagan",
        status: "yangi",
        source: req.body.source || 'direct',
        date: new Date().toLocaleString('uz-UZ')
    };

    fs.readFile(LEADS_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error("Leads faylini o'qishda xato:", err);
            return res.status(500).send('Error reading leads file.');
        }

        try {
            const leads = JSON.parse(data);
            leads.unshift(newLead); // Add new lead to the beginning
            
            fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8', (err) => {
                if (err) {
                    console.error("Ma'lumotlarni yozishda xato:", err);
                    return res.status(500).send('Error saving lead.');
                }
                console.log("Yangi so'rov muvaffaqiyatli saqlandi");
                res.status(201).json(newLead);
            });
        } catch (e) {
            console.error("JSON ni parse qilishda xato:", e);
            res.status(500).send('JSON parsing error.');
        }
    });
});

// API to update lead
app.put('/api/leads/:id/update', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    
    fs.readFile(LEADS_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading leads file.');
        }
        
        try {
            const leads = JSON.parse(data);
            const leadIndex = leads.findIndex(lead => lead.id === leadId);
            
            if (leadIndex === -1) {
                return res.status(404).send('Bunday ID topilmadi.');
            }
            
            // Faqat ruxsat etilgan maydonlarni yangilash
            const allowedFields = ['assignedTo', 'status', 'clientSurname'];
            
            Object.keys(req.body).forEach(key => {
                if (allowedFields.includes(key)) {
                    leads[leadIndex][key] = req.body[key];
                }
            });
            
            fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8', (err) => {
                if (err) {
                    return res.status(500).send('Error saving leads file.');
                }
                res.status(200).json(leads[leadIndex]);
            });
        } catch (e) {
            console.error("JSON ni parse qilishda xato:", e);
            res.status(500).send('JSON parsing error.');
        }
    });
});

// API to delete a lead
app.delete('/api/leads/:id', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    
    fs.readFile(LEADS_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading leads file.');
        }
        
        try {
            let leads = JSON.parse(data);
            const initialLength = leads.length;
            leads = leads.filter(lead => lead.id !== leadId);

            if (leads.length === initialLength) {
                return res.status(404).send('Bunday ID topilmadi.');
            }

            fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8', (err) => {
                if (err) {
                    return res.status(500).send('Error saving leads file.');
                }
                res.status(200).send({ message: 'Muvaffaqiyatli o\'chirildi' });
            });
        } catch (e) {
            console.error("JSON ni parse qilishda xato:", e);
            res.status(500).send('JSON parsing error.');
        }
    });
});

// API to download leads as XLSX
app.get('/api/leads/download', auth, async (req, res) => {
    try {
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mijozlar');

        // Yangi kolonka tartibiga o'tish
        worksheet.columns = [
            { header: 'Sana', key: 'date', width: 20 },
            { header: 'Ism', key: 'clientName', width: 20 },
            { header: 'Familiya', key: 'clientSurname', width: 20 },
            { header: 'Telefon', key: 'phone', width: 20 },
            { header: 'Brend Nomi', key: 'brandName', width: 25 },
            { header: 'Shaxs Turi', key: 'personType', width: 15 },
            { header: 'Operator', key: 'assignedTo', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Manba', key: 'source', width: 20 }
        ];

        // Ustun sarlavhalarini qalin qilish
        worksheet.getRow(1).font = { bold: true };
        
        // Ma'lumotlarni qatorlarga qo'shish
        leads.forEach(lead => {
            worksheet.addRow({
                date: lead.date || '',
                clientName: lead.clientName || '',
                clientSurname: lead.clientSurname || '',
                phone: lead.phone || '',
                brandName: lead.brandName || '',
                personType: lead.personType || '',
                assignedTo: lead.assignedTo || '',
                status: lead.status || '',
                source: lead.source || ''
            });
        });
        
        // Qatorlarga stil berish
        worksheet.eachRow({ includeEmpty: true }, function(row, rowNumber) {
            // Har bir katak uchun ramka
            row.eachCell({ includeEmpty: true }, function(cell) {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
            
            // Sarlavha qatori rangini o'zgartirish
            if (rowNumber === 1) {
                row.eachCell({ includeEmpty: true }, function(cell) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFD3D3D3' }
                    };
                });
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=mijozlar.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('XLSX faylini yaratishda xatolik:', error);
        res.status(500).send('Excel faylini yaratishda xatolik yuz berdi.');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server http://localhost:${PORT} portida ishga tushdi`);
});
                
 