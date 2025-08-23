document.addEventListener('DOMContentLoaded', function() {
    const tableBody = document.querySelector('#leadsTable tbody');
    const refreshBtn = document.getElementById('refreshBtn');

    function fetchLeads() {
        // Yangilashdan oldin jadvalni tozalash
        tableBody.innerHTML = '<tr><td colspan="6">Yuklanmoqda...</td></tr>';

        fetch('/api/leads')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Autentifikatsiya xatosi yoki server javob bermayapti.');
                }
                return response.json();
            })
            .then(leads => {
                tableBody.innerHTML = ''; // Tozalash
                if (leads.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="6">Hozircha so\'rovlar mavjud emas.</td></tr>';
                    return;
                }

                leads.forEach(lead => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${lead.date}</td>
                        <td>${lead.name}</td>
                        <td>${lead.brand_name || '-'}</td>
                        <td>${lead.phone}</td>
                        <td>${lead.business_industry || '-'}</td>
                        <td>${lead.source}</td>
                    `;
                    tableBody.appendChild(row);
                });
            })
            .catch(error => {
                console.error('Error fetching leads:', error);
                tableBody.innerHTML = `<tr><td colspan="6">Ma'lumotlarni yuklashda xatolik: ${error.message}</td></tr>`;
            });
    }

    // Sahifa yuklanganda ma'lumotlarni olish
    fetchLeads();

    // "Yangilash" tugmasi bosilganda ma'lumotlarni qayta yuklash
    refreshBtn.addEventListener('click', fetchLeads);
});
