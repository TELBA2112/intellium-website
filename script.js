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

        const leadData = {
            name: document.getElementById('name').value,
            brand_name: document.getElementById('brand_name').value,
            phone: '+' + phoneMask.unmaskedValue, // Maska belgilaridan tozalangan raqamni olish
            business_industry: document.getElementById('business_industry').value,
            source: sourceInput.value || 'direct'
        };
        
        // Raqam to'liq kiritilganini tekshirish
        if (phoneMask.unmaskedValue.length !== 12) {
            alert('Iltimos, telefon raqamini to\'liq kiriting.');
            return;
        }

        // Ma'lumotlarni serverga jo'natish
        fetch('/api/leads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(leadData),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Success:', data);
            
            // --- O'ZGARTIRISH: alert() o'rniga chiroyli xabar ko'rsatish ---
            const successMessage = document.getElementById('success-message');
            successMessage.classList.remove('hidden');

            setTimeout(() => {
                successMessage.classList.add('hidden');
            }, 4000); // 4 sekunddan keyin yopish

            leadForm.reset();
            phoneMask.updateValue(); // Maska qiymatini ham tozalash
        })
        .catch((error) => {
            console.error('Error:', error);
            alert('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
        });
    });
});
