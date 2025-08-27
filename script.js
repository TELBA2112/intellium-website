console.log("Sayt muvaffaqiyatli yuklandi!");

document.addEventListener('DOMContentLoaded', function() {
    // Reklama manbasini URL dan olish (masalan, ?source=instagram_reklama_1)
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');

    // Manbani formadagi yashirin maydonga joylash
    const sourceInput = document.getElementById('source');
    if (sourceInput && source) {
        sourceInput.value = source;
    }

    // Telefon raqam maydonini formatlash (maska)
    const phoneInput = document.getElementById('phone');
    const phoneMask = IMask(phoneInput, {
        mask: '+{998} (00) 000-00-00',
        lazy: false, // Kursor kirganda maskani ko'rsatish
    });

    // Forma jo'natilishini boshqarish
    const leadForm = document.getElementById('leadForm');
    leadForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Sahifani yangilanishini to'xtatish

        // Ma'lumotlarni yig'ish
        const nameValue = document.getElementById('name').value.trim();
        const brandValue = document.getElementById('brand_name').value.trim();
        const industryValue = document.getElementById('business_industry').value.trim();
        const phoneValue = '+' + phoneMask.unmaskedValue;
        const sourceValue = sourceInput.value || 'direct';

        // Ma'lumotlarni tekshirish
        if (!nameValue || nameValue.length < 2) {
            alert('Iltimos, ismingizni to\'g\'ri kiriting.');
            return;
        }

        if (phoneMask.unmaskedValue.length !== 12) {
            alert('Iltimos, telefon raqamini to\'liq kiriting.');
            return;
        }

        // Servergа yuboriladigan ma'lumotlar
        const leadData = {
            name: nameValue,
            brand_name: brandValue,
            phone: phoneValue,
            business_industry: industryValue,
            source: sourceValue
        };

        console.log("Serverga yuborilayotgan ma'lumotlar:", leadData);

        // Ma'lumotlarni serverga jo'natish
        fetch('/api/leads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(leadData),
        })
        .then(response => {
            // Avval xato holatlarda muammo bo'lishini oldini olish
            if (!response.ok) {
                throw new Error(`Server xatosi: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Server javobi:', data);
            
            // Muvaffaqiyatli xabar ko'rsatish
            const successMessage = document.getElementById('success-message');
            successMessage.classList.remove('hidden');

            // Forma maydonlarini tozalash
            leadForm.reset();
            phoneMask.updateValue(); // Maska qiymatini tozalash
            
            // 4 soniyadan so'ng xabarni yopish
            setTimeout(() => {
                successMessage.classList.add('hidden');
            }, 4000);
        })
        .catch((error) => {
            console.error('Xatolik:', error);
            alert(`So'rovni yuborishda xatolik yuz berdi: ${error.message}`);
        });
    });
});

app.listen(3000, '0.0.0.0', () => {
  console.log("Server running on port 3000");
});
