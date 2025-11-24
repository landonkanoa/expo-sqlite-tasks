import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";

export default function ExpenseScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState([]);
  const [filteredExpenses, setFilteredExpenses] = useState([]);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [filter, setFilter] = useState("all"); // "all", "week", "month"
  const [totalSpending, setTotalSpending] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState({});

  // Edit modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");

  // Get today's date in ISO format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  // Get start of current week (Sunday)
  const getWeekStart = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek;
    const weekStart = new Date(today.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart.toISOString().split("T")[0];
  };

  // Get start of current month
  const getMonthStart = () => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return monthStart.toISOString().split("T")[0];
  };

  const loadExpenses = async () => {
    try {
      const rows = await db.getAllAsync(
        "SELECT * FROM expenses ORDER BY date DESC, id DESC;"
      );
      setExpenses(rows);
      applyFilter(rows, filter);
    } catch (error) {
      console.error("Error loading expenses:", error);
    }
  };

  const applyFilter = (expenseList, filterType) => {
    let filtered = expenseList;

    if (filterType === "week") {
      const weekStart = getWeekStart();
      filtered = expenseList.filter((expense) => expense.date >= weekStart);
    } else if (filterType === "month") {
      const monthStart = getMonthStart();
      filtered = expenseList.filter((expense) => expense.date >= monthStart);
    }

    setFilteredExpenses(filtered);
    calculateTotals(filtered);
  };

  const calculateTotals = (expenseList) => {
    // Calculate overall total
    const total = expenseList.reduce((sum, expense) => sum + expense.amount, 0);
    setTotalSpending(total);

    // Calculate totals by category
    const categoryMap = {};
    expenseList.forEach((expense) => {
      if (!categoryMap[expense.category]) {
        categoryMap[expense.category] = 0;
      }
      categoryMap[expense.category] += expense.amount;
    });
    setCategoryTotals(categoryMap);
  };

  const addExpense = async () => {
    const amountNumber = parseFloat(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount");
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();

    if (!trimmedCategory) {
      Alert.alert("Category Required", "Please enter a category");
      return;
    }

    // Use provided date or today's date
    const expenseDate = date || getTodayDate();

    try {
      await db.runAsync(
        "INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?);",
        [amountNumber, trimmedCategory, trimmedNote || null, expenseDate]
      );

      setAmount("");
      setCategory("");
      setNote("");
      setDate("");

      loadExpenses();
    } catch (error) {
      console.error("Error adding expense:", error);
      Alert.alert("Error", "Failed to add expense");
    }
  };

  const deleteExpense = async (id) => {
    try {
      await db.runAsync("DELETE FROM expenses WHERE id = ?;", [id]);
      loadExpenses();
    } catch (error) {
      console.error("Error deleting expense:", error);
      Alert.alert("Error", "Failed to delete expense");
    }
  };

  const openEditModal = (expense) => {
    setEditingExpense(expense);
    setEditAmount(expense.amount.toString());
    setEditCategory(expense.category);
    setEditNote(expense.note || "");
    setEditDate(expense.date);
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    const amountNumber = parseFloat(editAmount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount");
      return;
    }

    const trimmedCategory = editCategory.trim();
    if (!trimmedCategory) {
      Alert.alert("Category Required", "Please enter a category");
      return;
    }

    try {
      await db.runAsync(
        "UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?;",
        [
          amountNumber,
          trimmedCategory,
          editNote.trim() || null,
          editDate,
          editingExpense.id,
        ]
      );

      setEditModalVisible(false);
      setEditingExpense(null);
      loadExpenses();
    } catch (error) {
      console.error("Error updating expense:", error);
      Alert.alert("Error", "Failed to update expense");
    }
  };

  const renderExpense = ({ item }) => (
    <TouchableOpacity
      style={styles.expenseRow}
      onPress={() => openEditModal(item)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>
          ${Number(item.amount).toFixed(2)}
        </Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
        <Text style={styles.expenseDate}>{item.date}</Text>
      </View>

      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          deleteExpense(item.id);
        }}
        style={styles.deleteButton}
      >
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  useEffect(() => {
    async function setup() {
      try {
        // First, check if the table exists and if it has a date column
        const tableInfo = await db.getAllAsync("PRAGMA table_info(expenses);");
        const hasDateColumn = tableInfo.some((col) => col.name === "date");

        if (!hasDateColumn && tableInfo.length > 0) {
          // Table exists but doesn't have date column - add it
          await db.execAsync("ALTER TABLE expenses ADD COLUMN date TEXT;");
          // Update existing records with today's date
          const today = getTodayDate();
          await db.runAsync(
            "UPDATE expenses SET date = ? WHERE date IS NULL;",
            [today]
          );
        } else if (tableInfo.length === 0) {
          // Table doesn't exist - create it with date column
          await db.execAsync(`
            CREATE TABLE expenses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              amount REAL NOT NULL,
              category TEXT NOT NULL,
              note TEXT,
              date TEXT NOT NULL
            );
          `);
        }

        await loadExpenses();
      } catch (error) {
        console.error("Setup error:", error);
        // If there's an error, try creating the table from scratch
        try {
          await db.execAsync("DROP TABLE IF EXISTS expenses;");
          await db.execAsync(`
            CREATE TABLE expenses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              amount REAL NOT NULL,
              category TEXT NOT NULL,
              note TEXT,
              date TEXT NOT NULL
            );
          `);
          await loadExpenses();
        } catch (fallbackError) {
          console.error("Fallback setup error:", fallbackError);
        }
      }
    }

    setup();
  }, []);

  useEffect(() => {
    applyFilter(expenses, filter);
  }, [filter, expenses]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "all" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("all")}
        >
          <Text
            style={[
              styles.filterText,
              filter === "all" && styles.filterTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "week" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("week")}
        >
          <Text
            style={[
              styles.filterText,
              filter === "week" && styles.filterTextActive,
            ]}
          >
            This Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === "month" && styles.filterButtonActive,
          ]}
          onPress={() => setFilter("month")}
        >
          <Text
            style={[
              styles.filterText,
              filter === "month" && styles.filterTextActive,
            ]}
          >
            This Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* Totals Display */}
      <View style={styles.totalsContainer}>
        <Text style={styles.totalLabel}>
          Total Spending (
          {filter === "week"
            ? "This Week"
            : filter === "month"
            ? "This Month"
            : "All"}
          ):
        </Text>
        <Text style={styles.totalAmount}>${totalSpending.toFixed(2)}</Text>

        {Object.keys(categoryTotals).length > 0 && (
          <View style={styles.categoryBreakdown}>
            <Text style={styles.categoryTitle}>
              By Category (
              {filter === "week"
                ? "This Week"
                : filter === "month"
                ? "This Month"
                : "All"}
              ):
            </Text>
            {Object.entries(categoryTotals).map(([cat, total]) => (
              <Text key={cat} style={styles.categoryItem}>
                {cat}: ${total.toFixed(2)}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Add Expense Form */}
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 12.50)"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Category (Food, Books, Rent...)"
          placeholderTextColor="#9ca3af"
          value={category}
          onChangeText={setCategory}
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />
        <TextInput
          style={styles.input}
          placeholder="Date (YYYY-MM-DD) - optional, defaults to today"
          placeholderTextColor="#9ca3af"
          value={date}
          onChangeText={setDate}
        />
        <Button title="Add Expense" onPress={addExpense} />
      </View>

      {/* Expenses List */}
      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No expenses{" "}
            {filter === "week"
              ? "this week"
              : filter === "month"
              ? "this month"
              : "yet"}
            .
          </Text>
        }
      />

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Expense</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={editAmount}
              onChangeText={setEditAmount}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Category"
              placeholderTextColor="#9ca3af"
              value={editCategory}
              onChangeText={setEditCategory}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Note"
              placeholderTextColor="#9ca3af"
              value={editNote}
              onChangeText={setEditNote}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor="#9ca3af"
              value={editDate}
              onChangeText={setEditDate}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={saveEdit}
              >
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={styles.footer}>
        Tap an expense to edit • Data saved locally with SQLite
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#111827",
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    padding: 10,
    backgroundColor: "#1f2937",
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  filterButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  filterText: {
    color: "#9ca3af",
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#fff",
  },
  totalsContainer: {
    backgroundColor: "#1f2937",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#374151",
  },
  totalLabel: {
    color: "#9ca3af",
    fontSize: 14,
  },
  totalAmount: {
    color: "#10b981",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 4,
  },
  categoryBreakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  categoryTitle: {
    color: "#9ca3af",
    fontSize: 14,
    marginBottom: 8,
  },
  categoryItem: {
    color: "#e5e7eb",
    fontSize: 14,
    marginLeft: 8,
    marginBottom: 4,
  },
  form: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    padding: 10,
    backgroundColor: "#1f2937",
    color: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fbbf24",
  },
  expenseCategory: {
    fontSize: 14,
    color: "#e5e7eb",
  },
  expenseNote: {
    fontSize: 12,
    color: "#9ca3af",
  },
  expenseDate: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  deleteButton: {
    padding: 4,
  },
  delete: {
    color: "#f87171",
    fontSize: 20,
    marginLeft: 12,
  },
  empty: {
    color: "#9ca3af",
    marginTop: 24,
    textAlign: "center",
  },
  footer: {
    textAlign: "center",
    color: "#6b7280",
    marginTop: 12,
    fontSize: 12,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#374151",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  modalInput: {
    padding: 10,
    backgroundColor: "#111827",
    color: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#6b7280",
  },
  saveButton: {
    backgroundColor: "#3b82f6",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
