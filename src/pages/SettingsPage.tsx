import React, { useState, useEffect } from 'react';
import {
  Settings,
  Download,
  Upload,
  RefreshCw,
  Store,
  Shield,
  Smartphone,
  Save,
  CheckCircle2,
  AlertTriangle,
  X,
  FileJson,
  Trash2,
} from 'lucide-react';
import {
  getStoreSettings,
  saveStoreSettings,
  exportDatabaseJson,
  importDatabaseJson,
  seedDemoData,
  clearAllData,
} from '../db';
import { StoreSettings } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';
import { compressImage } from '../lib/image';
import { usePWAInstall } from '../lib/usePWAInstall';

interface SettingsPageProps {
  onSettingsSaved?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onSettingsSaved }) => {
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { success, error } = useToast();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Settings State
  const [storeName, setStoreName] = useState('');
  const [storeSubtitle, setStoreSubtitle] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ice, setIce] = useState('');
  const [rc, setRc] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [defaultWarrantyMonths, setDefaultWarrantyMonths] = useState<number>(12);
  const [lastBackupDate, setLastBackupDate] = useState<string | undefined>(undefined);

  // Dialogs
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importJsonPayload, setImportJsonPayload] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const s = await getStoreSettings();
      setStoreName(s.storeName || '');
      setStoreSubtitle(s.storeSubtitle || '');
      setAddress(s.address || '');
      setPhone(s.phone || '');
      setIce(s.ice || '');
      setRc(s.rc || '');
      setLogo(s.logo);
      setDefaultWarrantyMonths(s.defaultWarrantyMonths || 12);
      setLastBackupDate(s.lastBackupDate);
    }
    load();
  }, []);

  // Save Store Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated: StoreSettings = {
        storeName: storeName.trim(),
        storeSubtitle: storeSubtitle.trim() || undefined,
        address: address.trim(),
        phone: phone.trim(),
        ice: ice.trim() || undefined,
        rc: rc.trim() || undefined,
        logo,
        defaultWarrantyMonths: Number(defaultWarrantyMonths) || 12,
        language,
        theme,
        lastBackupDate,
      };
      await saveStoreSettings(updated);
      success(language === 'ar' ? "تم حفظ إعدادات المحل بنجاح." : "Paramètres du magasin enregistrés avec succès.");
      if (onSettingsSaved) onSettingsSaved();
    } catch {
      error(language === 'ar' ? "حدث خطأ أثناء حفظ الإعدادات." : "Erreur lors de l'enregistrement des paramètres.");
    }
  };

  // Upload Logo with Compression (max 256px)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 256, 0.9);
      setLogo(compressed);
      success(language === 'ar' ? "تم تحميل وتجهيز الشعار بنجاح." : "Logo chargé et compressé avec succès (max 256px).");
    } catch {
      error(language === 'ar' ? "خطأ أثناء معالجة الشعار." : "Erreur lors du traitement du logo.");
    }
  };

  // Clear All Demo Data (Start fresh with empty DB)
  const handleConfirmClear = async () => {
    try {
      await clearAllData();
      setShowClearConfirm(false);
      success(language === 'ar' ? t.settings.clearSuccess : "Toutes les données ont été effacées. Base de données vierge prête.");
      if (onSettingsSaved) onSettingsSaved();
    } catch {
      error(language === 'ar' ? "حدث خطأ أثناء مسح البيانات." : "Erreur lors de la suppression des données.");
    }
  };

  // Export Database JSON
  const handleExportBackup = async () => {
    try {
      const json = await exportDatabaseJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      const safeName = (storeName.trim() || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeName}_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update last backup date
      const nowStr = new Date().toISOString();
      setLastBackupDate(nowStr);
      const current = await getStoreSettings();
      await saveStoreSettings({ ...current, lastBackupDate: nowStr });

      success("Sauvegarde JSON exportée avec succès !");
    } catch {
      error("Erreur lors de l'export de la sauvegarde.");
    }
  };

  // Handle Import JSON File Selection
  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonPayload(content);
      setShowImportConfirm(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!importJsonPayload) return;
    try {
      await importDatabaseJson(importJsonPayload);
      success("Base de données restaurée avec succès !");
      setShowImportConfirm(false);
      setImportJsonPayload(null);
      // reload settings
      const s = await getStoreSettings();
      setStoreName(s.storeName);
      setStoreSubtitle(s.storeSubtitle || '');
      setAddress(s.address);
      setPhone(s.phone);
      setIce(s.ice || '');
      setRc(s.rc || '');
      setLogo(s.logo);
      setDefaultWarrantyMonths(s.defaultWarrantyMonths || 12);
      setLastBackupDate(s.lastBackupDate);
    } catch (err: any) {
      error(err.message || "Erreur lors de l'importation du fichier JSON.");
    }
  };

  // Reset Demo Data
  const handleConfirmReset = async () => {
    try {
      await seedDemoData();
      success("Données de démonstration marocaines réinitialisées !");
      setShowResetConfirm(false);
      const s = await getStoreSettings();
      setStoreName(s.storeName);
      setStoreSubtitle(s.storeSubtitle || '');
      setAddress(s.address);
      setPhone(s.phone);
      setIce(s.ice || '');
      setRc(s.rc || '');
      setLogo(s.logo);
      setDefaultWarrantyMonths(s.defaultWarrantyMonths || 12);
      setLastBackupDate(s.lastBackupDate);
    } catch {
      error("Erreur lors de la réinitialisation.");
    }
  };

  // Check if backup is older than 7 days
  const isBackupOutdated = () => {
    if (!lastBackupDate) return true;
    const last = new Date(lastBackupDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <span>{t.settings.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Personnalisez vos informations d'établissement, gérez vos sauvegardes hors-ligne et vos préférences
          </p>
        </div>
      </div>

      {/* Backup Reminder Banner if > 7 days */}
      {isBackupOutdated() && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">Rappel de Sécurité : </span>
              <span>{t.settings.noBackupYet}</span>
            </div>
          </div>
          <button
            onClick={handleExportBackup}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg transition shrink-0 self-start sm:self-auto"
          >
            Exporter une copie maintenant
          </button>
        </div>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Store Profile & Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSaveSettings} className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Store className="w-4 h-4 text-amber-400" />
              <span>{t.settings.storeInfo}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Store Name */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeName}
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={language === 'ar' ? 'اسم المحل (اتركه فارغاً للافتراضي: متجري)' : 'Nom du magasin (laisser vide pour: Mon Magasin)'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* 2. Store Logo (Preview, upload/replace/remove, max 256px) */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeLogo}
                </label>
                <div className="flex items-center gap-3">
                  {logo ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-neutral-700 shrink-0 shadow-sm bg-neutral-950 group">
                      <img src={logo} alt="Logo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setLogo(undefined)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 text-rose-400 transition"
                        title={language === 'ar' ? 'حذف الشعار' : 'Supprimer le logo'}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-neutral-950 border border-dashed border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-2xl uppercase shrink-0 shadow-inner">
                      {(storeName.trim() || (language === 'ar' ? 'متجري' : 'Mon Magasin')).charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 flex flex-wrap gap-2">
                    <label className="cursor-pointer flex-1 min-w-[140px]">
                      <span className="block px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-center text-neutral-200 font-medium transition text-xs">
                        {logo ? (language === 'ar' ? 'تغيير الشعار' : 'Remplacer le logo') : (language === 'ar' ? 'تحميل الشعار (PNG/JPG)' : 'Charger un logo (PNG/JPG)')}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>

                    {logo && (
                      <button
                        type="button"
                        onClick={() => setLogo(undefined)}
                        className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition"
                      >
                        {language === 'ar' ? 'حذف' : 'Supprimer'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  {language === 'ar' ? 'يتم ضغط الشعار تلقائياً إلى 256px كحد أقصى لحفظه محلياً في البونات.' : 'Le logo est automatiquement redimensionné à 256px max pour les bons de vente.'}
                </p>
              </div>

              {/* 3. Address */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeAddress}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="ex: Boulevard Mohammed V, Casablanca"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* 4. Phone */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storePhone}
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212 6 00 00 00 00"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* 5. Subtitle */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeSubtitle}
                </label>
                <input
                  type="text"
                  value={storeSubtitle}
                  onChange={(e) => setStoreSubtitle(e.target.value)}
                  placeholder="ex: Vente & Réparation Smartphones"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* Warranty default */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.defaultWarranty}
                </label>
                <select
                  value={defaultWarrantyMonths}
                  onChange={(e) => setDefaultWarrantyMonths(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                >
                  <option value={0}>0 mois (Sans)</option>
                  <option value={3}>3 mois</option>
                  <option value={6}>6 mois</option>
                  <option value={12}>12 mois (1 an)</option>
                  <option value={24}>24 mois (2 ans)</option>
                </select>
              </div>

              {/* ICE */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeIce}
                </label>
                <input
                  type="text"
                  value={ice}
                  onChange={(e) => setIce(e.target.value)}
                  placeholder="002891456000089"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* RC */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeRc}
                </label>
                <input
                  type="text"
                  value={rc}
                  onChange={(e) => setRc(e.target.value)}
                  placeholder="458921 Casa"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{t.save}</span>
              </button>
            </div>
          </form>

          {/* Preferences (Language & Theme) */}
          <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 border-b border-neutral-800 pb-3">
              Affichage & Langue
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">
                  {t.settings.languageSettings}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLanguage('fr')}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition ${
                      language === 'fr'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    Français (FR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('ar')}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition ${
                      language === 'ar'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    العربية (الدارجة)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">
                  {t.settings.themeSettings}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition ${
                      theme === 'dark'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {t.settings.dark}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition ${
                      theme === 'light'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {t.settings.light}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Backup & Restore + PWA (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Backup & Restore Panel */}
          <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>{t.settings.backupSection}</span>
            </h2>

            <p className="text-neutral-400 leading-relaxed text-[11px]">
              {t.settings.backupDescription}
            </p>

            {lastBackupDate && (
              <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-300 font-mono">
                <span className="text-neutral-500">{t.settings.lastBackup} </span>
                <span>{new Date(lastBackupDate).toLocaleDateString()} {new Date(lastBackupDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}

            <div className="space-y-2 pt-2">
              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold border border-neutral-700 transition"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>{t.settings.exportBackup}</span>
              </button>

              {/* Import Button */}
              <label className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 font-medium border border-neutral-800 cursor-pointer transition">
                <Upload className="w-4 h-4 text-neutral-400" />
                <span>{t.settings.importBackup}</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleSelectImportFile}
                  className="hidden"
                />
              </label>
            </div>

            {/* Reset & Clear Demo Data Buttons */}
            <div className="pt-4 border-t border-neutral-800 space-y-2">
              {/* Clear All Data Button */}
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.settings.clearAllData}</span>
              </button>

              {/* Reset Demo Data Button */}
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t.settings.resetDemoData}</span>
              </button>
            </div>
          </div>

          {/* PWA Section */}
          <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>{t.settings.pwaTitle}</span>
            </h2>

            <p className="text-neutral-400 text-[11px] leading-relaxed">
              {t.settings.pwaDesc}
            </p>

            {isInstalled ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.settings.alreadyInstalled}</span>
              </div>
            ) : isInstallable ? (
              <button
                onClick={install}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{t.settings.installApp}</span>
              </button>
            ) : (
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400 text-[11px]">
                Disponible via le menu du navigateur (Chrome / Edge : icône installer dans la barre d'adresse ; Safari : Partager → Sur l'écran d'accueil).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear All Data Confirm Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title={t.settings.clearAllData}
        message={t.settings.clearAllWarning}
        isDestructive={true}
      />

      {/* Reset Demo Data Confirm Dialog */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmReset}
        title={t.settings.resetDemoData}
        message={t.settings.resetWarning}
        isDestructive={true}
      />

      {/* Import JSON Confirm Dialog */}
      <ConfirmDialog
        isOpen={showImportConfirm}
        onClose={() => {
          setShowImportConfirm(false);
          setImportJsonPayload(null);
        }}
        onConfirm={handleConfirmImport}
        title="Restaurer la sauvegarde JSON"
        message={t.settings.backupWarning}
        isDestructive={true}
      />
    </div>
  );
};
