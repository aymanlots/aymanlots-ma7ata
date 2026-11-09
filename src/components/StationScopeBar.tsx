import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface StationScopeBarProps {
  onOpenSettings?: () => void;
}

/**
 * حارس ومزامن نطاق المحطة المختارة (StationScopeBar Logic):
 * يضمن عزل جميع البيانات (كوليات، حوالات، عمال، لاكيس) حصرياً داخل station_id الخاصة بالمحطة المختارة
 * وعدم حدوث أي تداخل بيانات عند تبديل المحطات من البارة الفوق (Header).
 */
export const StationScopeBar: React.FC<StationScopeBarProps> = () => {
  const {
    stations,
    selectedStationId,
    setSelectedStationId,
    userRole,
    userAssignedStationId,
  } = useApp();

  useEffect(() => {
    // 1. العامل (User): مقفل دائماً وحصرياً في محطته المعينة له من طرف الـ Admin
    if (userRole === 'worker') {
      if (userAssignedStationId && selectedStationId !== userAssignedStationId) {
        setSelectedStationId(userAssignedStationId);
      }
      return;
    }

    // 2. المدير (Admin): إذا كانت المحطة المختارة لم تعد موجودة (تم مسحها)، يتم الرجوع تلقائياً إلى "كل المحطات"
    if (selectedStationId && selectedStationId !== 'all') {
      const exists = stations.some(s => s.id === selectedStationId);
      if (!exists && stations.length > 0) {
        setSelectedStationId('all');
      }
    }
  }, [userRole, userAssignedStationId, selectedStationId, stations, setSelectedStationId]);

  // التبديل المرئي بين المحطات متاح في البارة الفوق (Header)، وإضافة المحطات والعمال في الإعدادات (بطونة واحدة فقط)
  return null;
};
