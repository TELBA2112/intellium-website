const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS va body-parser sozlamalari
app.use(cors());
app.use(bodyParser.json());

// Autentifikatsiya sozlamalari
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'intellium2023'; 

// Autentifikatsiya funksiyasi
const auth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === ADMIN_USER && password === ADMIN_PASS) {
        return next(); 
    }

    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Autentifikatsiya talab qilinadi.');
};

// Ma'lumotlar papkasi va fayl yo'lini aniqlash
const isRenderEnvironment = process.env.RENDER === 'true';
console.log('Muhit:', isRenderEnvironment ? 'Render' : 'Mahalliy');

// Ma'lumotlar saqlanadigan joy (disk yo'li)
let DATA_DIR;
if (isRenderEnvironment) {
    DATA_DIR = '/opt/render/project/data';
} else {
    DATA_DIR = path.join(__dirname, 'data');
}
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

console.log(`Ma'lumotlar papkasi: ${DATA_DIR}`);
console.log(`Leads fayli: ${LEADS_FILE}`);

// Statik fayllarni berish (HTML, CSS, JS)
app.use(express.static(__dirname));

// Ma'lumotlar papkasini yaratish
try {
    if (!fs.existsSync(DATA_DIR)) {
        console.log(`Ma'lumotlar papkasini yaratish: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Ma'lumotlar fayli mavjud bo'lmasa, yaratish
    if (!fs.existsSync(LEADS_FILE)) {
        console.log(`Ma'lumotlar faylini yaratish: ${LEADS_FILE}`);
        fs.writeFileSync(LEADS_FILE, '[]', 'utf8');
    }
} catch (error) {
    console.error("Ma'lumotlar papkasini/faylini yaratishda xatolik:", error);
}

// Admin sahifasini himoyalash
app.use('/admin.html', auth);
app.use('/admin.css', auth);
app.use('/admin.js', auth);

// API yo'llari: So'rovlarni olish
app.get('/api/leads', auth, (req, res) => {
    try {
        if (!fs.existsSync(LEADS_FILE)) {
            console.log("Ma'lumotlar fayli topilmadi. Bo'sh ro'yxat qaytariladi.");
            return res.json([]);
        }
        
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);
        res.json(leads);
    } catch (err) {
        console.error("Ma'lumotlarni o'qishda xatolik:", err);
        res.status(500).send('Ma\'lumotlarni o\'qishda xatolik.');
    }
});

// API yo'llari: Yangi so'rov qo'shish
app.post('/api/leads', (req, res) => {
    try {
        console.log("Yangi so'rov ma'lumotlari:", req.body);
        
        const newLead = {
            id: Date.now(),
            clientName: req.body.name || "",
            clientSurname: "",
            phone: req.body.phone || "",
            brandName: req.body.brand_name || "",
            personType: req.body.business_industry || "jismoniy",
            assignedTo: "tasdiqlanmagan",
            status: "yangi",
            source: req.body.source || "Noma'lum",
            date: new Date().toLocaleString('uz-UZ')
        };
        
        let leads = [];
        
        // Ma'lumotlarni o'qish
        if (fs.existsSync(LEADS_FILE)) {
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            try {
                leads = JSON.parse(data);
                if (!Array.isArray(leads)) {
                    console.warn("Fayl formatida xato. Yangi ro'yxat yaratildi.");
                    leads = [];
                }
            } catch (e) {
                console.error("JSON formatida xatolik:", e);
                leads = [];
            }
        }
        
        // Yangi ma'lumotni qo'shish
        leads.unshift(newLead);
        
        // Ma'lumotlarni saqlash
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        console.log(`Ma'lumotlar saqlandi. Bazada ${leads.length} ta so'rov bor.`);
        
        res.status(201).json(newLead);
    } catch (err) {
        console.error("Ma'lumotlarni saqlashda xatolik:", err);
        res.status(500).send('Ma\'lumotlarni saqlashda xatolik.');
    }
});

// API yo'llari: Ma'lumot yangilash
app.put('/api/leads/:id/update', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    
    try {
        if (!fs.existsSync(LEADS_FILE)) {
            return res.status(404).send('Ma\'lumotlar fayli topilmadi.');
        }
        
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(data);
        
        const leadIndex = leads.findIndex(lead => lead.id === leadId);
        
        if (leadIndex === -1) {
            return res.status(404).send('So\'rov topilmadi.');
        }
        
        // Ruxsat berilgan maydonlarni yangilash
        const allowedFields = ['assignedTo', 'status', 'clientSurname'];
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                leads[leadIndex][key] = req.body[key];
            }
        });
        
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        res.status(200).json(leads[leadIndex]);
    } catch (err) {
        console.error("Ma'lumotni yangilashda xatolik:", err);
        res.status(500).send('Ma\'lumotni yangilashda xatolik.');
    }
});

// API yo'llari: So'rovni o'chirish
app.delete('/api/leads/:id', auth, (req, res) => {
    const leadId = parseInt(req.params.id, 10);
    
    try {
        if (!fs.existsSync(LEADS_FILE)) {
            return res.status(404).send('Ma\'lumotlar fayli topilmadi.');
        }
        
        const data = fs.readFileSync(LEADS_FILE, 'utf8');
        let leads = JSON.parse(data);
        
        const initialLength = leads.length;
        leads = leads.filter(lead => lead.id !== leadId);
        
        if (leads.length === initialLength) {
            return res.status(404).send('So\'rov topilmadi.');
        }
        
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
        res.status(200).send({ message: 'So\'rov muvaffaqiyatli o\'chirildi.' });
    } catch (err) {
        console.error("So'rovni o'chirishda xatolik:", err);
        res.status(500).send('So\'rovni o\'chirishda xatolik.');
    }
});

// API yo'llari: Excel formatida yuklab olish
app.get('/api/leads/download', auth, async (req, res) => {
    try {
        let leads = [];
        
        if (fs.existsSync(LEADS_FILE)) {
            const data = fs.readFileSync(LEADS_FILE, 'utf8');
            leads = JSON.parse(data);
        }
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mijozlar');
        
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
        
        worksheet.getRow(1).font = { bold: true };
        
        // Ma'lumotlarni qo'shish
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
        
        // Jadvalni chiroyliroq qilish
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
            
            if (rowNumber === 1) {
                row.eachCell({ includeEmpty: true }, (cell) => {
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
        console.error('Excel yaratishda xatolik:', error);
        res.status(500).send('Excel yaratishda xatolik.');
    }
});

// Render.com uchun SIGTERM boshqaruvi
process.on('SIGTERM', () => {
    console.log('SIGTERM signali qabul qilindi. Server to\'xtatilmoqda...');
    process.exit(0);
});

// Serverni ishga tushirish
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ${PORT} portida ishga tushirildi.`);
});
